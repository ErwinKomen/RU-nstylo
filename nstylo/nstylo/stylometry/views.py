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
from django.shortcuts import get_object_or_404, render, redirect
from django.views.generic.detail import DetailView
from django.views.generic.base import RedirectView
from django.views.generic import ListView
from datetime import datetime
from time import sleep

from nstylo.settings import APP_PREFIX
from nstylo.stylometry.models import *
from nstylo.stylometry.forms import *



def home(request):
    """Renders the home page."""
    assert isinstance(request, HttpRequest)
    return render(
        request,
        'index.html',
        {
            'title':'RU-Cesar',
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
