"""
Definition of urls for nstylo.
"""

from datetime import datetime
from django.conf import settings
from django.conf.urls import include, url
from django.conf.urls.static import static
from django.contrib import admin
import django.contrib.auth.views

# Import from the app 'stylometry'
import nstylo.stylometry.views
from nstylo.stylometry.views import *
from nstylo.stylometry.apiviews import *
# from nstylo.stylometry.forms import *

# Import from NSTYLO as a whole
from nstylo.settings import APP_PREFIX, STATIC_ROOT

# Other Django stuff
from django.core import urlresolvers
from django.core.urlresolvers import reverse, reverse_lazy
from django.shortcuts import redirect
from django.views.generic.base import RedirectView

admin.autodiscover()

# Set admin stie information
admin.site.site_header = "Radboud University Nederlab stylo web service"
admin.site.site_title = "RU-nstylo Admin"

pfx = APP_PREFIX

urlpatterns = [
    # Examples:
    url(r'^$', nstylo.stylometry.views.home, name='home'),
    url(r'^demo', nstylo.stylometry.views.demo, name='demo'),
    url(r'^contact$', nstylo.stylometry.views.contact, name='contact'),
    url(r'^about', nstylo.stylometry.views.about, name='about'),
    url(r'^more', nstylo.stylometry.views.more, name='more'),
    url(r'^nlogin', nstylo.stylometry.views.nlogin, name='nlogin'),
    url(r'^getSites.*$', nstylo.stylometry.views.getSites, name='sites'),
    url(r'^doFDC', nstylo.stylometry.views.doFDC, name='fdc'),
    url(r'^freq',         NlabTest.as_view(),                         name='freq'),
    url(r'^ftable/(?P<pk>\d+)/$', FreqtableDetailView.as_view(),      name='ftable'),
    url(r'^ftable/list',  FreqtableListView.as_view(),                name='ftable_list'),
    # url(r'^fdetail/(?P<pk>\d+)/$', FreqtableDetailView.as_view(),     name='fdetail'),
    url(r'^ntable',       NlabTableDetail.as_view(),                  name='ntable'),
    url(r'^ajax/tabledata/(?P<pk>\d+)/$',GetTableData.as_view(),      name='tabledata'), 
    url(r'^info',         NlabInfo.as_view(),                         name='info'),
    url(r'^definitions$', RedirectView.as_view(url='/'+pfx+'admin/'), name='definitions'),
    url(r'^static/(?P<path>.*)$',django.views.static.serve, {'document_root': STATIC_ROOT}),
    url(r'^login/$',
        django.contrib.auth.views.login,
        {
            'template_name': 'login.html',
            'authentication_form': nstylo.stylometry.forms.BootstrapAuthenticationForm,
            'extra_context':
            {
                'title': 'Log in',
                'year': datetime.now().year,
            }
        },
        name='login'),
    url(r'^logout$',
        django.contrib.auth.views.logout,
        {
            'next_page': reverse_lazy('home'),
        },
        name='logout'),

    # Uncomment the admin/doc line below to enable admin documentation:
    url(r'^admin/doc/', include('django.contrib.admindocs.urls')),

    # Uncomment the next line to enable the admin:
    url(r'^admin/', admin.site.urls),
] 
