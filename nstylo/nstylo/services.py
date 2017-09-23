import os
import json
import sys
import requests
import urllib
from nstylo.utils import ErrHandle
# from nstylo.stylometry.views import NlabTableDetail

# Set the method
sMethod = "rest"

def get_information():
    """Receive information"""

    # Create a list of lists
    lFreqs = []
    oHeader = [ ['aap'], ['noot'], ['mies'], ['erwin'] ] 
    lFreqs.append(oHeader)
    oData = [[3],     [4],      [5], [6]     ]
    lFreqs.append(oData)
    oData = [[7],     [8],      [9], [2]     ]
    lFreqs.append(oData)
    # Set the correct URL
    url = "http://corpus-studio-web.cttnww-meertens.surf-hosted.nl/nlab/freq"
    # TESTING:
    # url = "http://localhost/nlab/freq"
    url = "http://localhost:6401/freq" 

    params = {'nstylo-freqlist': json.dumps( lFreqs)}    # question
    oBack = {'status': 'ok'}

    if sMethod == "urllib":
        # Use the URLLIB method
        oResult = make_post_request(url, params)
        if oResult == None:
            oBack['status'] = 'error'
        else:
            oBack['status'] = 'ok'
            oBack['json'] = oResult
    elif sMethod == "rest":
        # Use the DRF method
        params = {'table': json.dumps(lFreqs), 'owner': 'erwin'}
        url = "http://localhost:6401/ftable" 
        oResult = make_rest_request(url,params)
        if oResult == None:
            oBack['status'] = 'error'
        else:
            oBack['status'] = 'ok'
            oBack['json'] = oResult
    else:
        # Use the REQUESTS.POST method

        # headers = {'Content-type': 'application/json'}
        # headers = {'User-Agent': 'Mozilla/5.0'}
        # send the POST request
        r = requests.post(url,data=params)
        # Check the reply
        if r.status_code != 500:
            oBack['json'] = r.json()
        else:
            oBack['status'] = 'error'
            oBack['html'] = r.text
    # Return what we have
    return oBack

def make_post_request(sUrl, oData):
    """Make a POST request to a service and return the data in a JSON object"""

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
            description = sys.exc_info()[1]
            oErr.DoError(description)      
            return None

        # Return the result
        return oResult
    except:
        description = sys.exc_info()[1]
        oErr.DoError(description)      
        return None

def make_rest_request(sUrl, oData):
    """Make a POST request to a service and return the data in a JSON object"""

    oErr = ErrHandle()
    oResult = {}

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
        description = sys.exc_info()[1]
        oErr.DoError(description)      
        return None
