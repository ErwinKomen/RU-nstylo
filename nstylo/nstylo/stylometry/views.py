"""
Definition of views for the BROWSER app.
"""

from django.contrib import admin
from django.contrib.auth import login, authenticate
from django.contrib.auth.models import Group
# from django.contrib.staticfiles.templatetags.staticfiles import static
from django.core.urlresolvers import reverse
from django.core.paginator import Paginator, EmptyPage, PageNotAnInteger
from django.db.models import Q
from django.db.models.functions import Lower
from django.http import HttpRequest, HttpResponse, HttpResponseRedirect
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render, redirect, render_to_response
from django.template import RequestContext
from django.utils.decorators import method_decorator
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.generic.detail import DetailView
from django.views.generic.base import RedirectView
from django.views.generic import ListView, View
from datetime import datetime
from time import sleep
import random, os
import pyRserve
from pyRserve import TaggedList
import json

# REST framework
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, authentication, permissions
from rest_framework.authentication import SessionAuthentication, BasicAuthentication
from rest_framework.decorators import api_view

# NSTYLO
from nstylo.settings import APP_PREFIX, RESULTS_DIR, STATIC_ROOT, MEDIA_ROOT, MEDIA_URL
from nstylo.stylometry.models import *
from nstylo.stylometry.forms import *
from nstylo.utils import ErrHandle
import nstylo.services

conn = None
paginateEntries = 20

rFuncStr = """
    library(stylo)
    library(jsonlite)

    renderer <- function(filename, title, units) {
        dat <- rnorm(1000)
        png(file=filename, width=720, height=480)
        hist(dat, main=title, xlab=units)
        dev.off()
    }

    erwin <- function(arTitles) {
        txt = "bladerdak"
        return(txt)
    }

    jsonObjectToTable <- function(sJson) {
      # COnvert string to list of lists
      oThis <- jsonlite::fromJSON(sJson)
  
      nRows <- oThis$nrows              #  oThis['nrows'][[1]]
      nCols <- oThis$ncols              #  oThis['ncols'][[1]]
      rNames <- oThis$rowheaders        #  oThis['rowheaders'][[1]]
      cNames <- oThis$columnheaders     #  oThis['columnheaders'][[1]]
      tblThis <- oThis$table            #  oThis['table'][[1]]
      # Put table into matrix
      mThis <- matrix(data=tblThis, nrow=nRows, ncol=nCols)
      df_table <- data.frame(mThis)
      # Set column names and row names
      names(df_table) <- cNames
      row.names(df_table) <- rNames
  
      # Return the data.frame that has now been created
      return(df_table)
    }

    pca2 <- function(sTable) {

        # Convert input
        oTable <- jsonObjectToTable(sTable)

        # Run stylo on the transformed versino of [oTable]
        result <- tryCatch( {
            stylo(frequencies=t(oTable), analysis.type="PCR", gui=FALSE, 
                        write.png.file = TRUE, write.svg.file = TRUE,
                        custom.graph.filename="cesar_pca")
            }, error = function(err) {
                print(paste("nstylo.pca2 error: [", err, "]"))
                f <- list(status='error', msg=paste(err))
                return (f)
            })

        # Note: the resulting PNG is written in a file cesar_pca_nnn.png
        #       where "nnn" is a consecutive number
        # Directory: see getwd()

        # Assuming there are results: return the PCA coordinates

        if ("status" %in% names(result)) {
            print(paste("checkpoint #2"))
            oBack <- result
        } else {
            oBack <- list(
                        table=result$pca.coordinates, 
                        rownames=row.names(result$pca.coordinates), 
                        colnames=names(as.data.frame(result$pca.coordinates)))
        }
        
        return (jsonlite::toJSON(oBack))
    }

    clusterAnalysis <- function(sTable) {

        # Convert input
        oTable <- jsonObjectToTable(sTable)

        # Run stylo on the transformed versino of [oTable]
        result <- tryCatch( {
            stylo(frequencies=t(oTable), analysis.type="CA", gui=FALSE, 
                        write.png.file = TRUE, write.svg.file = TRUE,
                        custom.graph.filename="cesar_ca")
            }, error = function(err) {
                print(paste("nstylo.clusterAnalysis error: [", err, "]"))
                f <- list(status='error', msg=paste(err))
                return (f)
            })

        # Note: the resulting PNG is written in a file cesar_ca_nnn.png
        #       where "nnn" is a consecutive number
        # Directory: see getwd()

        if ("status" %in% names(result)) {
            print(paste("checkpoint #3"))
            oBack <- result
        } else {
            # Get the SVG file that has been made
            files <- list.files(pattern="cesar_ca.*svg")
            file <- files[1]
            content <- readLines(file)
            svg <- content[2:length(content)]

            # Assuming there are results: return the CA information
            # Note: we want numerical results to draw the DENDROGRAM ourselves
        
            # The distance table provides the distances between each two author/text combinations
            dt <- result$distance.table

            # Perform my own cluster algorithm to get the tree-information
            clres <- hclust(as.dist(dt), method="ward.D")

            # The 'list of edges' contains all the information needed to create a dendrogram
            loe <- result$list.of.edges

            oBack <- list(
                     dt_table=dt, 
                     dt_rownames=row.names(dt), 
                     dt_colnames=names(as.data.frame(dt)),
                     loe_table=loe, 
                     loe_rownames=row.names(loe), 
                     loe_colnames=names(as.data.frame(loe)),
                     cl_labels=clres$labels,
                     cl_order=clres$order,
                     cl_merge=clres$merge,
                     cl_height=clres$height,
                     svg=svg
                     )
        }
        return (jsonlite::toJSON(oBack))
    }


"""

def getRConnection():
    """Establish a connection with Rserve and load it with our program"""

    global conn
    rServeHost = 'localhost'
    rServePort = 6311

    # Check if a connection alread exists
    if conn and type(conn) is pyRserve.rconn.RConnector and not conn.isClosed:
        # Return the existing connection
        return conn.r
    # There's no connection yet: establish one
    try:
        conn = pyRserve.connect(host=rServeHost, port=rServePort)
    except:
        # This probably means that Rserve is not running
        return None
    # Load the function that needs to be there
    conn.eval(rFuncStr)
    # Return the connection, which now contains our function
    return conn.r

def getRConnObject():
    """Establish a connection with Rserve and load it with our program"""

    global conn
    rServeHost = 'localhost'
    rServePort = 6311

    # Check if a connection alread exists
    if conn and type(conn) is pyRserve.rconn.RConnector and not conn.isClosed:
        # Return the existing connection
        return conn
    # There's no connection yet: establish one
    try:
        conn = pyRserve.connect(host=rServeHost, port=rServePort)
    except:
        # This probably means that Rserve is not running
        return None
    # Load the function that needs to be there
    conn.eval(rFuncStr)
    # Return the connection, which now contains our function
    return conn

def home(request):
    """Renders the home page."""
    assert isinstance(request, HttpRequest)
    return render(
        request,
        'index.html',
        {
            'title':'RU-nstylo',
            'year':datetime.now().year,
            'pfx': APP_PREFIX,
            'site_url': admin.site.site_url,
        }
    )

def contact(request):
    """Renders the contact page."""
    assert isinstance(request, HttpRequest)
    return render(
        request,
        'contact.html',
        {
            'title':'Contact',
            'message':'Henk van den Heuvel',
            'year':datetime.now().year,
        }
    )

def more(request):
    """Renders the more page."""
    assert isinstance(request, HttpRequest)
    return render(
        request,
        'more.html',
        {
            'title':'More',
            'year':datetime.now().year,
        }
    )

def about(request):
    """Renders the about page."""
    assert isinstance(request, HttpRequest)
    return render(
        request,
        'about.html',
        {
            'title':'About',
            'message':'Radboud University NSTYLO utility.',
            'year':datetime.now().year,
        }
    )

def nlogin(request):
    """Renders the not-logged-in page."""
    assert isinstance(request, HttpRequest)
    context = {'title':'Not logged in',
         'message':'Radboud University NSTYLO utility.',
         'year':datetime.now().year,}
    return render(request,'nlogin.html',context)

def demo(request):
    """Default page to show for the pyRserve demonstration"""

    # Note: the MainForm is defined in forms.py
    context = {'form': MainForm()}
    return render(request, 'stylometry/demo.html', context)

def getSites(request):
    (seriesType, units) = request.GET["value"].split("_")
    availableSites = [('site1a', 'site1'), ('site2a', 'site2')]
    availableSites = list(map(lambda x: ("%s|%s" % (x[0], x[1]), x[1]), availableSites))
    availableSites.insert(0, ('', 'please select a site'))
    response = render_to_response("stylometry/sites_list.html", {'sites': availableSites})
    response.set_cookie("seriesType", seriesType)
    response.set_cookie("units", units)
    return response

def doFDC(request):
    (siteId, siteName) = request.GET["value"].split("|")
    (seriesType, units) = (request.COOKIES["seriesType"], request.COOKIES["units"])
    filename = "%d_%s" % (random.randint(1000, 9999), "boxplot.png")
    R = getRConnection()
    # Get the correct location on the server
    resultFile = os.path.abspath(os.path.join(MEDIA_ROOT, filename))
    R.renderer(resultFile, "Random data for site %s (%s)" % (siteName, units), units)
    # Calculate the correct URL to approache it
    url = MEDIA_URL + filename
    # THink of the context
    context = {'fdc_result_file': url}
    # Render the little piece of HTML that is going to be returned
    return render(request,'stylometry/fdc_result.html', context)

def get_r_reply(list, sCommand):
    """Perform the [sCommand] in R on the data in [sTable]"""

    oBack = {'status': 'ok', 'response': ''}
    # Decipher the table
    iSize = len(list)
    # Get an R connection
    R = getRConnection()
    if R == None:
        oBack['status'] = 'error'
        oBack['response'] = "Rserve is probably not running"
        return oBack
    # Do some action on this list
    lHeaderRow = list[0]
    iColumns = len(lHeaderRow)
    y = R.erwin(json.dumps(lHeaderRow))


    oBack['response'] = "get_r_reply receives a list of size {} by {}, and 'R' returned [{}]".format(iSize, iColumns, y)
    # Return what we made
    return oBack

def get_r_pca_reply(sTable):
    """Perform the [PCA] in R on the data in [sTable]"""

    oBack = {'status': 'ok', 'response': ''}
    oErr = ErrHandle()
    try:
        # Get an R connection
        connThis = getRConnObject()
        if connThis == None:
            oBack['status'] = 'error'
            oBack['response'] = "Rserve is probably not running"
            return oBack

        # Let 'R' convert the table into a data frame
        connThis.r.dfTable = connThis.r.jsonObjectToTable(sTable)

        # Let R perform 'stylo' PCR directly on [sTable]
        spcaResult = connThis.r.pca2(sTable)
        pcaResult = json.loads(spcaResult[0])

        # Check the result for R-errors
        if 'status' in pcaResult and len(pcaResult['status'])>0 and pcaResult['status'][0] == "error":
            # There is an error, so pass it on to the caller
            oBack['status'] = 'error'
            if 'msg' in pcaResult and len(pcaResult['msg'])>0:
                oBack['response'] = pcaResult['msg'][0]
            else:
                oBack['response'] = json.dumps(pcaResult['msg'])
            return oBack

        # Adapt the resulting table with the information in object pcaResult
        lTable = []
        lRow = ['']
        for hdr in pcaResult['colnames']:
            lRow.append(hdr)
        lTable.append(lRow)
        for idx in range(0, len(pcaResult['rownames'])):
            lRow = []
            lRow.append(pcaResult['rownames'][idx])
            for cell in pcaResult['table'][idx]:
                lRow.append(cell)
            lTable.append(lRow)
        nCols = len(pcaResult['colnames'])
        nRows = len(pcaResult['rownames'])
        
        # Add the full table 
        pcaResult['fulltable'] = lTable

        oBack['contents'] = pcaResult
        oBack['response'] = "get_r_pca_reply: I have pca coordinates of {} rows by {} columns".format(nRows, nCols)
        # Return what we made
        return oBack
    except:
        msg = oErr.DoError("get_r_pca_reply error: ")
        oBack['status'] = 'error'
        oBack['response'] = msg
        return oBack
    
def get_r_cluster_reply(sTable):
    """Perform a CLUSTER ANALYSIS in R on the data in [sTable]"""

    oBack = {'status': 'ok', 'response': ''}
    prefixes = ['dt_', 'loe_']
    oErr = ErrHandle()
    try:
        # Get an R connection
        connThis = getRConnObject()
        if connThis == None:
            oBack['status'] = 'error'
            oBack['response'] = "Rserve is probably not running"
            return oBack

        # Let 'R' convert the table into a data frame
        connThis.r.dfTable = connThis.r.jsonObjectToTable(sTable)

        # Let R perform 'stylo' CA directly on [sTable]
        sResult = connThis.r.clusterAnalysis(sTable)
        oResult = json.loads(sResult[0])

        # Check the result for R-errors
        if 'status' in oResult and len(oResult['status'])>0 and oResult['status'][0] == "error":
            # There is an error, so pass it on to the caller
            oBack['status'] = 'error'
            if 'msg' in sResult and len(oResult['msg'])>0:
                oBack['response'] = oResult['msg'][0]
            else:
                oBack['response'] = json.dumps(oResult['msg'])
            return oBack

        # The results contain a dt and loe table with their row and column names

        # Adapt the resulting table with the information in object oResult
        for prefix in prefixes:
            lTable = []
            lRow = ['']
            for hdr in oResult[prefix+'colnames']:
                lRow.append(hdr)
            lTable.append(lRow)
            for idx in range(0, len(oResult[prefix+'rownames'])):
                lRow = []
                lRow.append(oResult[prefix+'rownames'][idx])
                for cell in oResult[prefix+'table'][idx]:
                    lRow.append(cell)
                lTable.append(lRow)
                    
            # Add the full table 
            oResult[prefix+'fulltable'] = lTable

        nCols = len(oResult[prefixes[0]+'colnames'])

        # Adapt the cl_merge table to include the 'height' and 'label'
        lMerge = oResult['cl_merge']
        lHeight = oResult['cl_height']
        lLabels = oResult['cl_labels']
        for idx in range(0,len(lMerge)):
            oMerge = lMerge[idx]
            oMerge.append( lHeight[idx])
            oMerge.append( lLabels[idx])
            lMerge[idx] = oMerge
        oResult['cl_merge'] = lMerge

        oBack['contents'] = oResult
        oBack['response'] = "get_r_cluster_reply: I have cluster information of {} items".format(nCols)
        # Return what we made
        return oBack
    except:
        msg = oErr.DoError("get_r_cluster_reply error: ")
        oBack['status'] = 'error'
        oBack['response'] = msg
        return oBack
    


class NlabInfo(View):
    template_name = 'stylometry/info.html'

    def get(self,request, **kwargs):
        sType = 'vm'
        if 'path' in kwargs:
            sType = kwargs['path']
            # Clear the kwargs 'path'
            kwargs.pop('path')
        oReply = nstylo.services.get_information(sType)
        context = dict()
        context['callpath'] = oReply['url']
        if 'status' in oReply and oReply['status'] == 'ok' and 'json' in oReply:
            context['nlabinfo'] = oReply['json']
        elif 'status' in oReply and oReply['status'] != 'ok':
            context['nlabinfo'] = oReply['html']
        else:
            context['nlabinfo']  = 'No HTML in response'
        return render_to_response(self.template_name, context,**kwargs)
    

class CsrfExemptSessionAuthentication(SessionAuthentication):
    """Provide a class that does not require CSRF authentication"""

    def enforce_csrf(self, request):
        return  # To not perform the csrf check previously happening


class GetTableData(APIView):
    """Provide JSON data of one table for d3 drawing"""

    oErr = ErrHandle()
    authentication_classes = (CsrfExemptSessionAuthentication, BasicAuthentication)

    def post(self, request, *args, **kwargs):
        """Return the data of the FreqTable object"""

        # Get the FreqTable object with the 'pk' in [kwargs]
        self.object = FreqTable.objects.get(pk=kwargs['pk'])

        # Get the PCA data
        oPca = self.object.get_pca()

        response = JsonResponse(oPca, safe=False)
        return response
    

class NlabTableDetail(APIView):
    """Focus on handling one table"""

    oErr = ErrHandle()
    permission_classes = (permissions.AllowAny,)
    authentication_classes = (CsrfExemptSessionAuthentication, BasicAuthentication)

    def get_object(self, pk):
        try:
            return FreqTable.objects.get(pk=pk)
        except User.DoesNotExist:
            raise Http404

    def get(self, request, format=None):
        """List all currently available freqtables"""

        ftables = FreqTable.objects.all()
        serializer = FreqTableSerializer(ftables, many=True)
        return Response(serializer.data)
    
    def get(self, request, pk, format=None):
        """Retrieve one particular frequency table"""

        ftable = self.get_object(pk)
        ftable = FreqTableSerializer(ftable)
        return Response(ftable.data)

    def post(self, request, format=None):
        """Create a new FreqTable object"""

        self.oErr.Status("NlabTableDetail - POST 1")

        # Get the freqtable data and turn it into a FreqTable instance
        serializer = FreqTableSerializer(data=request.data) 

        self.oErr.Status("NlabTableDetail - POST 2")

        try:
            if serializer.is_valid():
                self.oErr.Status("NlabTableDetail - POST 3")

                # Save the FreqTable instance to the SQLite database
                instance = serializer.save() 

                # Find out who the owner is
                owner = instance.owner
                # Remove all previous instances of this owner
                qs = FreqTable.objects.filter(owner=owner).exclude(id=instance.id)
                if qs.count() > 0:
                    qs.delete()

                self.oErr.Status("NlabTableDetail - POST 4")
                # Now perform the requested R-actions on the table data
                if instance.method == "pca":
                    # Perform Principle Component Analysis
                    oResponse = get_r_pca_reply(instance.table)
                elif instance.method == "ca":
                    # Perform Cluster Analysis
                    oResponse = get_r_cluster_reply(instance.table)
                else:
                    oResponse = {'status': 'error', 'msg': 'unknown analysis method'}
                # OLD:oResponse = get_r_reply(json.loads(instance.table), "analyze")
                if oResponse['status'] == 'ok':

                    sReply = json.dumps({'status': 'ok', 
                                         'html': oResponse['response'],
                                         'contents': oResponse['contents']});

                    self.oErr.Status("NlabTableDetail - POST 5 [{}]".format(sReply))
                else:
                    sReply = json.dumps({'status': 'error', 'html': oResponse['response']});

                # Return an appropriate response
                #return Response(serializer.data, status=status.HTTP_201_CREATED)
                return Response(sReply, status=status.HTTP_200_OK)

            # Getting here means that the data was not valid
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except:
            # Show the error
            self.oErr.DoError("NlabTableDetail.post")
            # Getting here means that the data was not valid
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk, format=None):
        """Delete one particular frequency table"""

        ftable = self.get_object(pk)
        ftable.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def get_author_title_list(oTable):
    """Get the author-title information from the first line of the table"""

    lInfo = sorted(oTable[0])
    lOut = []
    for item in lInfo:
        arInfo = item.split("_")
        lOut.append({"author": arInfo[0], "title": arInfo[1]})
    return lOut


class FreqtableDetailView(DetailView):
    """Process one particular frequency table"""

    model = FreqTable
    template_name = 'stylometry/freqtable_detail.html'  # Fill this in when we are going to use it

    def get(self, request, *args, **kwargs):
        # Get the object instance we are dealing with
        self.object = self.get_object()
        # For further processing we need to have the context
        context = self.get_context_data(**kwargs)
        # Find out what type of operation is required
        sType = self.request.GET.get('download_type', '')
        if sType == 'freqtbl':
            return self.download_freqtbl(context)
        elif sType == 'wordlist':
            return self.download_wordlist(context)
    
        # Getting here means there was no relevant [download_type]
        oTable = json.loads(self.object.table)
        context['headers'] = oTable['columnheaders']       #   get_author_title_list(oTable)
        currentuser = self.request.user
        context['authenticated'] = currentuser.is_authenticated

        # Make sure the object id is available
        context['table_id'] = self.object.id

        # Find an rfunction (if existing)
        sType = self.request.GET.get('rfunction', '')
        if sType == 'pca':
            # The user wants to have a PCA done on the data
            # NOTE: send the data as is--as stringified JSON
            oResponse = get_r_pca_reply(self.object.table)
            # Check the response and make it available
            context['status'] = oResponse['status']
            if oResponse['status'] == "ok":
                context['r_pca_response'] = oResponse['response']
                # Get the PCA coordinates
                context['r_pca_contents'] = oResponse['contents']
                # Make sure to store these results in the appropriate object
                self.object.set_pca(oResponse['contents'])
        elif sType == "cluster":
            # This is a CLUSTER ANALYSIS
            oResponse = get_r_cluster_reply(self.object.table)
            # Check the response and make it available
            context['status'] = oResponse['status']
            if oResponse['status'] == "ok":
                context['r_ca_response'] = oResponse['response']
                # Get the PCA coordinates
                context['r_ca_contents'] = oResponse['contents']
                # Make sure to store these results in the appropriate object
                self.object.set_ca(oResponse['contents'])
            

        # Simply show the detailed view
        return self.render_to_response(context)

    def get_object(self, queryset = None):
        obj = super().get_object(queryset)
        return obj

    def get_context_data(self, **kwargs):
        context = super(FreqtableDetailView, self).get_context_data(**kwargs)
        context['now'] = timezone.now()
        context['descriptor'] = self.object
        return context

    def download_freqtbl(self, context):
        """Turn the table into a stylo-type 'table_with_frequencies.txt'"""

        # Get access to the table
        oFtable = json.loads( self.object.table)
        sFileName = "table_with_frequencies.txt"
        lResult = []
        # Process the header row
        lHeader = oFtable['columnheaders']
        #for item in lTable[0]:
        #    if item != "":
        #        lHeader.append('"{}"'.format(item))
        lResult.append(" ".join(lHeader))
        # Process all the remaining lines
        lRows = oFtable['rowheaders']
        lTable = oFtable['table']
        i = 0
        for idx in range(0, len(lRows)):
            # Start a row and add the row header
            lRow = []
            lRow.append('"{}"'.format(lRows[idx]))
            for j in range(0, len(lHeader)):
                # This is a floating point number
                lRow.append("{}".format(lTable[i]))
                i+=1
            lResult.append(" ".join(lRow))
        # Now turn the result list into a string
        sResult = "\n".join(lResult)
        # Build the result
        response = HttpResponse(sResult, content_type='text/csv')
        response['Content-Encoding'] = "utf-8"
        response['Content-Disposition'] = 'attachment; filename="' + sFileName
        # Return the result
        return response

    def download_wordlist(self, context):
        """Turn the table into a stylo-type 'wordlist.txt'"""

        # Get access to the table
        oFtable = json.loads( self.object.table)
        sFileName = "wordlist.txt"
        lResult = oFtable['rowheaders']
        sResult = "\n".join(lResult)
        # Build the result
        response = HttpResponse(sResult, content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="' + sFileName
        # Return the result
        return response
    

class FreqtableListView(ListView):
    """List all the currently loaded frequency tables"""
    
    model = FreqTable
    template_name = "stylometry/freqtable_list.html"
    paginate_by = paginateEntries
    entrycount = 0
    qs = None

    def render_to_response(self, context, **response_kwargs):
        # Present the available information sorted by owner
        self.qs = FreqTable.objects.all().order_by('owner')
        context['object_list'] = self.qs
        # Add information to the context
        currentuser = self.request.user
        context['authenticated'] = currentuser.is_authenticated
        ftable_list = []
        for ftable in self.qs:
            # Store the owner of this table
            ftInfo = {'owner': ftable.owner}
            # Unpack this table
            oTable = json.loads(ftable.table)

            # Find out what kind of table this is
            if 'nrows' in oTable:
                ftInfo['wordnum'] = oTable['nrows']
                ftInfo['textnum'] = oTable['ncols']
                ftInfo['titles'] = oTable['columnheaders']
            else:
                ftInfo['wordnum'] = len(oTable)
                if len(oTable) == 0:
                    ftInfo['textnum'] = 0
                    ftInfo['titles'] = []
                else:
                    ftInfo['textnum'] = len(oTable[0])
                    ftInfo['titles'] = oTable[0]
            ftInfo['pk'] = ftable.pk
            ftInfo['id'] = ftable.id
            ftable_list.append(ftInfo)
        context['ftable_list'] = ftable_list
        # Continue with the normal operation
        return super(FreqtableListView, self).render_to_response(context, **response_kwargs)

    def get_queryset(self):
        self.qs = FreqTable.objects.all().order_by('owner')
        return self.qs
