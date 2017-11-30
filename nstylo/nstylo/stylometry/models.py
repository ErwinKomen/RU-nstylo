from django.db import models
from rest_framework import serializers
import json

MAX_USERNAME = 1000

class FreqTable(models.Model):

    # [1] Obligatory table (json, but dumped as string)
    table = models.TextField()
    # [0-1] THe table owner (derived from the request; may be empty to facilitate migrations)
    owner = models.CharField("User name", default="anonymous", max_length=MAX_USERNAME)
    # [0-1] PCA information
    pca = models.TextField(blank=True, null=True)
    # [0-1] CA (cluster analysis) information
    ca = models.TextField(blank=True, null=True)

    def set_pca(self, oPcaInfo):
        # Store the results as a string
        self.pca = json.dumps( oPcaInfo)
        self.save()

    def get_pca(self):
        sPca = self.pca
        if sPca != None and sPca != "":
            # Return the object representation of the results
            return json.loads(sPca)
        else:
            # Return an empty object
            return {}

    def set_ca(self, oCaInfo):
        # Store the results as a string
        self.ca = json.dumps( oCaInfo)
        self.save()

    def get_ca(self):
        sCaInfo = self.ca
        if sCaInfo != None and sCaInfo != "":
            # Return the object representation of the results
            return json.loads(sCaInfo)
        else:
            # Return an empty object
            return {}




class FreqTableSerializer(serializers.ModelSerializer):

    class Meta:
        model = FreqTable
        fields = ("id", "table", "owner")

