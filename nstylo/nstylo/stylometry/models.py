from django.db import models
from rest_framework import serializers

MAX_USERNAME = 1000

class FreqTable(models.Model):

    # [1] Obligatory table (json, but dumped as string)
    table = models.TextField()
    # [0-1] THe table owner (derived from the request; may be empty to facilitate migrations)
    owner = models.CharField("User name", default="anonymous", max_length=MAX_USERNAME)


class FreqTableSerializer(serializers.ModelSerializer):

    class Meta:
        model = FreqTable
        fields = ("id", "table", "owner")

