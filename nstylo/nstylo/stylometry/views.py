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
from rest_framework import status
from rest_framework.decorators import api_view

# NSTYLO
from nstylo.settings import APP_PREFIX, RESULTS_DIR, STATIC_ROOT, MEDIA_ROOT
from nstylo.stylometry.models import *
from nstylo.stylometry.forms import *
from nstylo.utils import ErrHandle
import nstylo.services

conn = None

if "\\" in STATIC_ROOT:
    resultDir = os.path.abspath(os.path.join(STATIC_ROOT.replace("\\nstylo\\","\\nstylo\\nstylo\\"), "results"))
else:
    resultDir = os.path.abspath(os.path.join(STATIC_ROOT, "results"))

rFuncStr = """
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
"""

#try:
#    from rpy2.robjects import r as R

#    def getRConnection():
#        return R
#except:
#    import pyRserve
#    conn = None
#    rServeHost = 'localhost'
#    rServePort = 6311

#    def getRConnection():
#        global conn
#        if conn and type(conn) is pyRserve.rconn.RConnector and not conn.isClosed:
#            return conn.r
#        conn = pyRserve.connect(host=rServeHost, port=rServePort)
#        conn.eval(rFuncStr)
#        return conn.r

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
    conn = pyRserve.connect(host=rServeHost, port=rServePort)
    # Load the function that needs to be there
    conn.eval(rFuncStr)
    # Return the connection, which now contains our function
    return conn.r

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
    resultFile = os.path.abspath(os.path.join(resultDir, filename))
    R.renderer(resultFile, "Random data for site %s (%s)" % (siteName, units), units)
    # Calculate where it is going to be 
    url = "/" + APP_PREFIX + "static/results/"+filename
    # THink of the context
    context = {'fdc_result_file': url}
    # Render the little piece of HTML that is going to be returned
    return render(request,'stylometry/fdc_result.html', context)


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
        return get_r_reply(list, "analyze")

def get_r_reply(list, sCommand):
    """Perform the [sCommand] in R on the data in [sTable]"""

    # Decipher the table
    iSize = len(list)
    # Get an R connection
    R = getRConnection()
    # Do some action on this list
    lHeaderRow = list[0]
    iColumns = len(lHeaderRow)
    y = R.erwin(json.dumps(lHeaderRow))


    response = "get_r_reply receives a list of size {} by {}, and 'R' returned [{}]".format(iSize, iColumns, y)
    # Return what we made
    return response


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
    


class NlabTableDetail(APIView):
    """Focus on handling one table"""

    oErr = ErrHandle()

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
                sReply = get_r_reply(json.loads(instance.table), "analyze")

                sReply = json.dumps({'status': 'ok', 'html': sReply});

                self.oErr.Status("NlabTableDetail - POST 5 [{}]".format(sReply))

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

