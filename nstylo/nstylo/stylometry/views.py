"""
Definition of views for the BROWSER app.
"""

from django.contrib import admin
from django.contrib.auth import login, authenticate
from django.contrib.auth.models import Group
from django.core.urlresolvers import reverse
from django.core.paginator import Paginator, EmptyPage, PageNotAnInteger
from django.db.models import Q
from django.db.models.functions import Lower
from django.http import HttpRequest, HttpResponse, HttpResponseRedirect
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render, redirect, render_to_response
from django.template import RequestContext
from django.views.generic.detail import DetailView
from django.views.generic.base import RedirectView
from django.views.generic import ListView
from datetime import datetime
from time import sleep
import random, os

from nstylo.settings import APP_PREFIX, RESULTS_DIR, STATIC_ROOT
from nstylo.stylometry.models import *
from nstylo.stylometry.forms import *

# resultDir = RESULTS_DIR
# resultDir = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "static/stylometry/results/"))
resultDir = os.path.abspath(os.path.join(STATIC_ROOT, "results/"))
rFuncStr = """
    renderer <- function(filename, title, units) {
        dat <- rnorm(1000)
        png(file=filename, width=720, height=480)
        hist(dat, main=title, xlab=units)
        dev.off()
    }
"""

try:
    from rpy2.robjects import r as R

    def getRConnection():
        return R
except:
    import pyRserve
    conn = None
    rServeHost = 'localhost'
    rServePort = 6311

    def getRConnection():
        global conn
        if conn and type(conn) is pyRserve.rconn.RConnector and not conn.isClosed:
            return conn.r
        conn = pyRserve.connect(host=rServeHost, port=6311)
        conn.eval(rFuncStr)
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
    return render(
        request,
        'nlogin.html',
        {
            'title':'Not logged in',
            'message':'Radboud University NSTYLO utility.',
            'year':datetime.now().year,
        }
    )


def index(request):
    context = {'form': MainForm()}
    return render(request, 'stylometry/index.html', context)


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
    # return HttpResponse('<img src="/static/stylometry/results/' + filename + '" />')
    return HttpResponse('<img src="/static/results/' + filename + '" />')

