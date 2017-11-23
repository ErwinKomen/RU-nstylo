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

#if "\\" in STATIC_ROOT:
#    resultDir = os.path.abspath(os.path.join(STATIC_ROOT.replace("\\nstylo\\","\\nstylo\\nstylo\\"), "results"))
#else:
#    resultDir = os.path.abspath(os.path.join(STATIC_ROOT, "results"))
# resultDir = os.path.abspath(os.path.join(STATIC_ROOT, "results"))

# resultDir = os.path.abspath(os.path.join(STATIC_ROOT))

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

    pca <- function(oTable) {
        # Run stylo on [oTable]
        result <- stylo(frequencies=oTable, analysis.type="PCR", gui=FALSE)
        # Assuming there are results: return the PCA coordinates
        return (result$pca.coordinates)
    }
    
    pca2 <- function(sTable) {

        # Convert input
        oTable <- jsonObjectToTable(sTable)

        # Run stylo on the transformed versino of [oTable]
        result <- stylo(frequencies=t(oTable), analysis.type="PCR", gui=FALSE, 
                        write.png.file = TRUE, write.svg.file = TRUE,
                        custom.graph.filename="cesar_pca")
        # Note: the resulting PNG is written in a file cesar_pca_nnn.png
        #       where "nnn" is a consecutive number
        # Directory: see getwd()

        # Assuming there are results: return the PCA coordinates

        oBack <- list(
                 table=result$pca.coordinates, 
                 rownames=row.names(result$pca.coordinates), 
                 colnames=names(as.data.frame(result$pca.coordinates)))
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
    # resultFile = os.path.abspath(os.path.join(resultDir, filename))
    # csv_file = os.path.abspath( os.path.join(MEDIA_ROOT, csv_file))
    resultFile = os.path.abspath(os.path.join(MEDIA_ROOT, filename))
    R.renderer(resultFile, "Random data for site %s (%s)" % (siteName, units), units)
    # Calculate where it is going to be 
    # url = "/" + APP_PREFIX + "static/results/"+filename
    # url = "/" + APP_PREFIX + "media/"+filename
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

        # Let R perform principle component analysis on dfTable
        # y = connThis.r.pca(connThis.ref.dfTable)
        # NOTE: somehow this does not work. WHY??

        # Let R perform 'stylo' PCR directly on [sTable]
        spcaResult = connThis.r.pca2(sTable)
        pcaResult = json.loads(spcaResult[0])

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
    

@method_decorator(csrf_exempt, name='dispatch')
class NlabService(View):
    # Initialisations
    arErr = []              # Array of errors
    oErr = ErrHandle()
    step = "0" 

    data = {'status': 'ok', 'html': 'nlabservice is aan het werk'}       # Create data to be returned    

    def post(self, request):
        """ The POST option should be used mostly"""

        try:
            # A POST request is the only possible way to access our NLAB services
            self.oErr.Status("NlabService - POST 1")
            params = request.POST
            self.oErr.Status("NlabService - POST 2")
            sList = params.get('nstylo-freqlist')
            self.oErr.Status("NlabService - POST 3")
            if sList == "" or sList == None:
                list = {}
                self.oErr.Status("NlabService - POST: nstylo-freqlist is empty")
            else:
                list = json.loads(sList)

            self.oErr.Status("NlabService - POST 4")
            # Process the data in the LIST
            self.data['html'] = self.process_data(list)
            self.oErr.Status("NlabService - POST 5\n{}".format(self.data['html']))
        except:
            self.data['html'] = "an error has occurred in NlabService(View) at step {}: {}".format(self.step, self.oErr.get_error())

        # Figure out what we are going to return
        back = json.dumps(self.data)
        self.oErr.Status("NlabService - POST 6")

        # return JsonResponse(self.data)
        return HttpResponse(back, "application/json")

    def get(self, request):
        """The GET option is used in some instances"""

        self.oErr.Status("NlabService - GET")
        query = request.GET
        sList = query.get('nstylo-freqlist')
        if sList == "":
            list = {}
        else:
            list = json.loads(sList)

        # Process the data in the LIST
        self.data['html'] = self.process_data(list)

        # Figure out what we are going to return
        datadump = json.dumps(self.data)
        if 'callback' in query:
            callback = query.get('callback')
            back = "{}({})".format(callback, datadump)
        else:
            back = datadump
        return HttpResponse(back, "application/json")

    def process_data(self, list):
        return "The data is not processed"


class NlabTest(NlabService):
    
    def process_data(self, list):
        oBack = get_r_reply(list, "analyze")
        if oBack['status'] == 'ok':
            return oBack['response']
        else:
            return ""


class NlabInfo(View):
    template_name = 'stylometry/info.html'

    def get(self,request, **kwargs):
        oReply = nstylo.services.get_information()
        context = dict()
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
                oResponse = get_r_pca_reply(instance.table)
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

    def get(self, request, pk, format=None):
        """Retrieve one particular frequency table"""

        ftable = self.get_object(pk)
        ftable = FreqTableSerializer(ftable)
        return Response(ftable.data)

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
                context['r_response'] = oResponse['response']
                # Get the PCA coordinates
                context['r_contents'] = oResponse['contents']
                # Make sure to store these results in the appropriate object
                self.object.set_pca(oResponse['contents'])

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
