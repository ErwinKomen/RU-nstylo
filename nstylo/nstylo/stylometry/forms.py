"""
Definition of forms.
"""

from django import forms
from django.contrib.auth.forms import AuthenticationForm, UserCreationForm
from django.utils.translation import ugettext_lazy as _
from django.forms.widgets import *

class BootstrapAuthenticationForm(AuthenticationForm):
    """Authentication form which uses boostrap CSS."""
    username = forms.CharField(max_length=254,
                               widget=forms.TextInput({
                                   'class': 'form-control',
                                   'placeholder': 'User name'}))
    password = forms.CharField(label=_("Password"),
                               widget=forms.PasswordInput({
                                   'class': 'form-control',
                                   'placeholder':'Password'}))


class MainForm(forms.Form):
    seriesTypes = [('rainfall', 'mm'), ('elevation', 'm')]
    # seriesTypes = map(lambda x: ("%s_%s" % (x[0], x[1]), "%s (%s)" % (x[0], x[1])), seriesTypes)
    seriesTypes = list(map(lambda x: ("%s_%s" % (x[0], x[1]), "%s (%s)" % (x[0], x[1])), seriesTypes))
    seriesTypes.insert(0, ('', 'please select a series type'))
    series = forms.ChoiceField(choices=seriesTypes, widget=forms.Select(attrs={'onchange': 'ru.nstylo.selectSite()'}))
    site = forms.ChoiceField(widget=forms.Select(attrs={'onchange': 'ru.nstylo.doJobby()', 'disabled': 'disabled'}))

