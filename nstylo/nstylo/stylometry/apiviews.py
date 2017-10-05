from django.shortcuts import render
from django.template.response import TemplateResponse
from django.contrib.auth import login, logout
from django.http import Http404

# REST framework
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework import mixins
from rest_framework import request

from nstylo.stylometry.models import FreqTableSerializer


# NOTE: this was created under development
#       method is NOT IN CURRENT USE

#@api_view(['POST'])
#def nlabdetail(req):
#    """Pass on a new request"""

#    if req.method == "POST":
#        # Get the freqtable data and turn it into a FreqTable instance
#        x = req.data
#        inst = FreqTableSerializer(data=x)

#        if inst.is_valid():
#            # Save the FreqTable instance to the SQLite database
#            inst.save() 

#            # Return an appropriate response
#            return Response(inst.data, status=status.HTTP_201_CREATED)

#        # Getting here means that the data was not valic
#        return Response(inst.errors, status=status.HTTP_400_BAD_REQUEST)
        