import sys, json

class ErrHandle:
    """Error handling"""

    # ======================= CLASS INITIALIZER ========================================
    def __init__(self):
        # Initialize a local error stack
        self.loc_errStack = []

    # ----------------------------------------------------------------------------------
    # Name :    Status
    # Goal :    Just give a status message
    # History:
    # 6/apr/2016    ERK Created
    # ----------------------------------------------------------------------------------
    def Status(self, msg):
        # Just print the message
        print(msg, file=sys.stderr)

    # ----------------------------------------------------------------------------------
    # Name :    DoError
    # Goal :    Process an error
    # History:
    # 6/apr/2016    ERK Created
    # ----------------------------------------------------------------------------------
    def DoError(self, msg, bExit = False):
        # Append the error message to the stack we have
        self.loc_errStack.append(msg)
        # Print the error message for the user
        sTrace = self.get_error_message()
        print("Error: "+msg+"\nTracing: "+sTrace, file=sys.stderr)
        # Is this a fatal error that requires exiting?
        if (bExit):
            sys.exit(2)

    def get_error(self):
        lBack = []
        for nErr in sys.exc_info():
            if (nErr != None):
                lBack.append(str(nErr))
        return json.dumps(lBack)

    def get_error_message(self):
        arInfo = sys.exc_info()
        if len(arInfo) == 3:
            sMsg = str(arInfo[1])
            if arInfo[2] != None:
                sMsg += " at line " + str(arInfo[2].tb_lineno)
            return sMsg
        else:
            return ""


