import os
import json
import sys
import requests

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
    params = {'nstylo-freqlist': json.dumps( lFreqs)}    # question
    oBack = {'status': 'ok'}
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

