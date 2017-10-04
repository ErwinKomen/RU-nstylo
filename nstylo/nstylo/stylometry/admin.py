from django.contrib import admin
from django.forms import Textarea

from nstylo.stylometry.models import *

# Define admin models
class FreqTableAdmin(admin.ModelAdmin):
    list_filter = ['owner']
    list_display = ['owner', 'table']
    formfield_overrides = {
        models.TextField: {'widget': Textarea(attrs={'rows': 4})},
        }

# Register your models here.
admin.site.register(FreqTable, FreqTableAdmin)