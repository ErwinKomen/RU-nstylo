import os
import json
import sys
import requests
import urllib
from nstylo.utils import ErrHandle

# Set the method
sMethod = "rest"

def get_information(sType):
    """Receive information"""

    oErr = ErrHandle()
    oBack = {'status': 'ok'}
    try:
        # Create an object that can be processed
        oFreqs = {}
        lColumnHeaders = [ 'aap', 'noot', 'mies', 'erwin' ]
        lRowHeaders = ['met', 'een', 'gezwinde', 'spoed']
        oFreqs['rowheaders'] = lRowHeaders
        oFreqs['columnheaders'] = lColumnHeaders
        oFreqs['nrows'] = len(lRowHeaders)
        oFreqs['ncols'] = len(lColumnHeaders)
        oFreqs['table'] = [0.2, 0.3, 0.4, 0.1,\
                           0.5, 0.6, 1, 4,\
                           0.1, 0.5, 0.2, 3,\
                           0.9, 3, 0.1, 1]
        # Set the correct URL
        # Use the DRF method
        if sType == "vm":
            url = "http://corpus-studio-web.cttnww-meertens.surf-hosted.nl/nlab/ntable"
        elif sType == "local":
            # TESTING:
            url = "http://localhost:6510/ntable" 
        else:
            oBack['status'] = 'error'
            return oBack

        params = {'table': json.dumps(oFreqs), 'owner': 'erwin'}
        oResult = make_rest_request(url,params)
        if oResult == None:
            oBack['status'] = 'error'
        elif oResult['status'] == 'error':
            oBack['html'] = oResult['msg']
            oBack['status'] = 'error'
        else:
            oBack['status'] = 'ok'
            oBack['json'] = oResult['json']
        oBack['url'] = url
        # Return what we have
        return oBack
    except:
        oErr.DoError("get_information")      
        oBack['status'] = 'error'
        oBack['html'] = "get_information gives an error"
        return oBack
    
def make_post_request(sUrl, oData):
    """Make a POST request to a service and return the data in a JSON object
    
    NOTE: this function is *NOT* actually used, but the make_rest_request is used instead.
    """

    oErr = ErrHandle()
    oResult = {}

    try:
        # Make sure the data is correct
        if oData == None or len(oData) == 0:
            return None

        # Set the URL
        strUrl = "http://localhost:6401/freq"

        # COnvert the incoming data
        data = urllib.parse.urlencode(oData).encode('ascii')

        oPost = {'Accept':'application/json', 
                 'Content-Type': 'application/x-www-form-urlencoded'}
        req = urllib.request.Request(strUrl, headers=oPost, data=data, method='POST')

        try:
            # Perform the actual request to the URL
            # POST method: 
            with urllib.request.urlopen(req, timeout = 20) as response:
                # Get the response as a text
                sResult = response.read().decode('utf-8')
                # First check the result myself
                if sResult == "" or sResult[:1] != "{":
                    # The result is empty, or at least not JSON
                    oResult = {}
                else:
                    # Convert the response text to an object, interpreting it as JSON
                    oResult = json.loads(sResult)
        except urllib.error.URLError as e:
            oErr.Status('URLopen URL error: {}\ndata: {}\n url: {}\n'.format(
                e.reason, str(data), strUrl))
        except:
            # description = sys.exc_info()[1]
            oErr.DoError("make_post_request")      
            return None

        # Return the result
        return oResult
    except:
        # description = sys.exc_info()[1]
        oErr.DoError("make_post_request")      
        return None

def make_rest_request(sUrl, oData):
    """Make a POST request to a service and return the data in a JSON object"""

    oErr = ErrHandle()
    oResult = {}
    oResult['status'] = 'ok'

    try:
        # Make a POST request
        headers = {'Content-Type': 'application/json'}
        r =   requests.post(sUrl,data=json.dumps(oData), headers=headers)

        # Check the reply
        if r.status_code != 500:
            oResult['json'] = r.json()
        else:
            oResult['status'] = 'error'
            oResult['html'] = r.text
        

        # Return the result
        return oResult
    except:
        oErr.DoError("make_rest_request")  
        oResult['status'] = 'error' 
        oResult['msg'] = "make_rest_request error"   
        oResult['json'] = {}
        return oResult
