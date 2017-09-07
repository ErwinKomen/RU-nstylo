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

from nstylo.settings import APP_PREFIX, RESULTS_DIR, STATIC_ROOT, MEDIA_ROOT
from nstylo.stylometry.models import *
from nstylo.stylometry.forms import *

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

    data = {'status': 'ok', 'html': 'nlabservice is aan het werk'}       # Create data to be returned    

    def post(self, request):
        """ The POST option should be used mostly"""

        # A POST request is the only possible way to access our NLAB services
        params = request.POST
        sList = params['nstylo-freqlist']
        if sList == "":
            list = {}
        else:
            list = json.loads(sList)

        # Process the data in the LIST
        self.data['html'] = self.process_data(list)

        # Figure out what we are going to return
        back = json.dumps(self.data)

        # return JsonResponse(self.data)
        return HttpResponse(back, "application/json")

    def get(self, request):
        """The GET option is used in some instances"""

        get = request.GET
        sList = get['list']
        if sList == "":
            list = {}
        else:
            list = json.loads(sList)

        # Process the data in the LIST
        self.data['html'] = self.process_data(list)

        # Figure out what we are going to return
        datadump = json.dumps(self.data)
        if 'callback' in get:
            callback = get['callback']
            back = "{}({})".format(callback, datadump)
        else:
            back = datadump
        return HttpResponse(back, "application/json")

    def process_data(self, list):
        return "The data is not processed"

class NlabTest(NlabService):
    
    def process_data(self, list):
        # Process the data in the LIST
        iSize = len(list)
        for item in list:
            x = item
        # Open a connection with R
        R = getRConnection()
        y = R.erwin(json.dumps( list[0]))

        response = "NlabService 'process_data' receives a list of size {}, and 'R' returned {}".format(iSize, y)
        # Return what we made
        return response


def freq(request):

    data = {'status': 'ok', 'html': 'Hello World'}       # Create data to be returned    
    x = None
    callback = ""

    if request.method == "POST":
        if request.POST:
            x = request.POST
    elif request.method == "GET":
        if request.GET:
            x = request.GET
            callback = request.GET['callback']
    # return JsonResponse(data)
    datadump = json.dumps(data)
    back = "{}({})".format(callback, datadump)
    return HttpResponse(back, "application/json")