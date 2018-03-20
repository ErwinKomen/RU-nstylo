/*jshint browser: true, indent: 2, regexp: true, nomen: true, devel: true, laxbreak: true */
/* global titles, nv, d3 */

// Zie http://www.adequatelygood.com/JavaScript-Module-Pattern-In-Depth.html
var nederlab = (function ($, nederlab) {
    "use strict";

    // Zie Javascript: The good parts, p. 52
    nederlab.stylometry = Object.create(commonView);

    var stylometry = function ($, config) {
      var loc_queries = null,
        userinfo = nederlab.model.userservice.getUserInfo(),
        nstylodev = "//localhost:6510/",   // "//localhost/nlab/",                     
        nstylourl = "http://corpus-studio-web.cttnww-meertens.surf-hosted.nl/nlab/",                     
                                              // Base URL of the Nstylo service
        loc_simulation = null,                // D3 force object
        loc_bProduction = false,              // SET THIS TO TRUE for the production environment
        loc_iPageSize = 20,                   // Number of results to be shown (FIXED)
        loc_iPageNum = 0,                     // Number of pages available
        loc_iPageCurrent = 0,                 // Currently selected page
        loc_iDocTotal = 0,                    // Total number of docs
        loc_ca_network = {},                  // Currently selected options
        loc_ca_graph = {},                    // Currently selected options
        loc_ca_dendro = {},                   // Currently selected options
        MAX_ALLOWED_DOCS = 2000,              // Maximum number of docs we are allowed to handle
        loc_lDocInfo = [],                    // List with info objects per document: one batch
        loc_lAuthorInfo = [],                 // List that contains all the authors involved with the selected corpus
        loc_lTitleInfo = [],                  // List of titles
        loc_bCorpusDone = false,              // Flag: has all the information on the authors in the corpus been found?
        loc_lResultFreq = [],                 // List of frequencies per document
        loc_lResultMfw = [],                  // List of most-frequent-word objects
        loc_lResultMfwList = [],              // MFW list (words)
        loc_oPcaTable = {},                   // Local copy of PCA information
        loc_oExclude = {},                    // Object that specifies what is excluded
        loc_sReplaceChar = "",                // What replace character to use for space
        loc_qParams = {},                     // Query parameters for keeps
        loc_oQuery = {},                      // Local copy of the currently used query
        loc_xhr = null,                       // The handle to the currently running 'askbroker' ajax call
        loc_sOutType = "alldocs",             // Selected output type: 'alldocs', '', ...
        loc_sZoekterm = "(leeg)",             // Local copy of the zoekterm
        loc_sSortType = "",                   // Kind of sorting (if any)
        loc_sSortAuthor = "asc",              // Sort direction: corpus, author
        loc_sSortTitle = "asc",               // Sort direction: corpus, title
        loc_sSortYear = "asc",                // Sort direction: corpus, year
        loc_sSortWord = "asc",                // Sort direction: frequency-list, word
        loc_sSortFreq = "asc",                // Sort direction: frequency-list, freq
        loc_msgNstylo = "nstylo-msg",         // Messages from nstylo
        loc_msgDiv = "stylometry-message";    // Name of the <div> where messages can appear

      // Define private methods
      var private_methods = {
        addLegend : function(options) {
          var sMethod = "", // Sampling method
              iSize = 0,    // Sample size
              sExcl = "";   // Exclusion string
          
          try {
            // Check to see if the correct options are there
            if (! ('divsvg' in options && 'x' in options &&
                   'y' in options && 'legend' in options)) {
              private_methods.showMessage("Fout in addLegend: missing option");
              return false;
            }
            d3.select(options['divsvg']).append("svg:g")
                .append("svg:text")
                .attr("x",options['x'])
                .attr("y",options['y'])
                .attr("class", "ca-legendtext")
                .text(options['legend']);
            // Add the sampling method that has been used
            sMethod = private_methods.getStringParam(loc_qParams, "stylo-sampling-method", "no");
            if (sMethod === "") {sMethod = "no"; }
            iSize = private_methods.getIntParam(loc_qParams, "stylo-samplesize", 10000);
            if (sMethod !== "no") {
              sMethod +=  "(size=" + iSize + " - nog niet geïmplementeerd)";
            }
            d3.select(options['divsvg']).append("svg:g")
                .append("svg:text")
                .attr("x",options['x'])
                .attr("y",options['y']+15)
                .attr("class", "ca-legendtext")
                .text("Sampling: "+ sMethod );
            // Check for exclusions
            if (loc_oExclude !== null && loc_oExclude !== {}) {
              if (loc_oExclude['word'].length > 0) {
                sExcl += " words (" + loc_oExclude['word'].join(",")+")";
              }
              if (loc_oExclude['lemma'].length > 0) {
                sExcl += " lemma's (" + loc_oExclude['lemma'].join(",")+")";
              }
              if (loc_oExclude['pos'].length > 0) {
                sExcl += " pos-tags (" + loc_oExclude['pos'].join(",")+")";
              }
              if (sExcl !== "") {
                sExcl = "Excluded: " + sExcl;
                d3.select(options['divsvg']).append("svg:g")
                    .append("svg:text")
                    .attr("x",options['x'])
                    .attr("y",options['y'] + 30)
                    .attr("class", "ca-legendtext")
                    .text(sExcl);
              }
            }
            
            return true;
          } catch (err) {
            private_methods.showMessage("Fout in [addLegend]: " + err.message);
            return false;
          }
        },
        askBroker : function(options) {
          try {
            var retval = {}, authinfo, ajaxoptions = {
              type: "POST",
              url: config.searchurl,
              data: JSON.stringify(options.query),
              async: false,    // Note: CHROME warns against this
              dataType: "json",
              contentType: "application/json; charset=UTF-8",
              success: function (data) {
                retval.finalquery = options.query;
                retval.status = "OK";
                retval.data = data;
              },
              error: function(xhr, textStatus, errorThrown) {
                retval.status = "error";
                retval.data = {status: xhr.statusText,
                               text: textStatus,
                               error: errorThrown};
              }
            };
            authinfo = nederlab.controller.getAuthorizationHeadersForProxy({method: "POST", path: config.searchpath, username: true});
            if (authinfo !== null) {
              ajaxoptions.headers = authinfo.headers;
              ajaxoptions.url += authinfo.username;
            }
            // Make an AJAX call, but keep the process id, so that we can 'abort' it
            loc_xhr = $.ajax(ajaxoptions);
            // Return the result
            return retval;
          } catch (err) {
            private_methods.showMessage("Fout in [askBroker]: " + err.message);
            return {finalquery: "", status: "error", data: ""};
          }
        },
        /**
         * askNstylo
         *    Send a command to NSTYLO
         *    The 'options' must at least contain:
         *    'command' - the last part of the URL to call
         *    'query'   - the JSON data to be sent (as text)
         * 
         * @param {object} options
         * @param {function} callbackFunc
         * @returns {object}
         */
        askNstylo : function(options, callbackFunc) {
          try {
            var data=null,      // The data we are passing on
              retval = {},      // Return value object
              ajaxoptions = {}, // Options for the call
              sMethod = "json", // How to send
              sContType = "",   // ContentType
              url = "";         // The URL of the nstylo service
            
            // Prepare the data
            switch (sMethod) {
              case "json":  // Send as simple JSON data
                sContType = "application/json";
                data = JSON.stringify(options.query);
                break;
              default:      // Send as if this is form data
                sContType = "application/x-www-form-urlencoded";
                data = $.param(options.query);
                break;
            }
            
            // Determine the URL, depending on production or testing
            url = ('production' in options && options['production']) ? nstylourl : nstylodev;
            // Add the command to the URL
            url += options.command;
            ajaxoptions = {
              method: "POST", 
              url: url,
              data: data,
              cache: false,
              contentType: sContType,
              success: function(sBack) {
                var oResponse = {};
                
                // What is returned must be a JSON string
                if (sBack.indexOf("{") === 0) {
                  oResponse = JSON.parse(sBack);
                } else {
                  oResponse['status'] = 'error';
                  oResponse['html'] = 'No json is returned, but: '+sBack;
                }
                // Use a callback function to finish off the request
                callbackFunc(oResponse);
              },
              error: function (xhr, textStatus, errorThrown) {
                retval.status = "error";
                retval.data = {status: xhr.statusText,
                               text:   textStatus,
                               error:  errorThrown};
                callbackFunc({'status': 'error', 'html': 'The nstylo service returned an error'});
              }
            };
            
            
            // Make an AJAX call, but keep the process id, so that we can 'abort' it
            loc_xhr = $.ajax(ajaxoptions);
            
            /*
            // ALTERNATIVE method: simply use jQuery's $.post() command
            var jqxhr = $.post(url, options.query, function(d, status, xhr) {
              var oResponse = JSON.parse(d);
              callbackFunc(oResponse);
            })
            .fail(function(xhr, status, error) {
              callbackFunc({'status': 'error', 'html': 'The nstylo service returned an error'});
            });*/
            // Return the result
            return retval;
          } catch (err) {
            private_methods.showMessage("Fout in [askNstylo]: " + err.message);
            return {finalquery: "", status: "error", data: ""};
          }
        },
        /**
         * canHandleAmount
         *    Check if we are able to handle the amount of documents indicated
         * 
         * @param {type} iDocTotal
         * @returns {Boolean}
         */
        canHandleAmount : function(iDocTotal) {
          var bCanHandle = false;
          try {
            // Check if we can handle this amount of documents
            bCanHandle = (iDocTotal <= MAX_ALLOWED_DOCS);
            // If we cannot handle it, give an error message
            if (!bCanHandle) {
              private_methods.showMessage("Uw corpus bevat "+iDocTotal+ " documenten, maar dat is teveel voor een Stylometrieanalyse.<br>"+
                      "Stylometrie binnen Nederlab kan maximaal "+MAX_ALLOWED_DOCS+" documenten verwerken.");
            }
            // Return the boolean
            return bCanHandle;
          } catch (err) {
            private_methods.showMessage("Fout in [canHandleAmount]: " + err.message);
            return false;
          }
        },
        
        /**
         * calculateViewport
         *    Calculate an object with the visible bounds
         *      of the <svg> element
         * 
         * @param {type} svg
         * @returns {object}
         */
        calculateViewport : function(svg){ 
          var style    = getComputedStyle(svg),
              owidth   = parseInt(style.width,10),
              oheight  = parseInt(style.height,10),
              aspect   = svg.preserveAspectRatio.baseVal,
              viewBox  = svg.viewBox.baseVal,
              width    = viewBox && viewBox.width  || owidth,
              height   = viewBox && viewBox.height || oheight,
              oBack    = {},
              x        = viewBox ? viewBox.x : 0,
              y        = viewBox ? viewBox.y : 0;
      
          try {
            if (!width || !height || !owidth || !oheight) return;
            if (aspect.align===aspect.SVG_PRESERVEASPECTRATIO_NONE || !viewBox || !viewBox.height){
              oBack = {x:x,y:y,width:width,height:height};
            } else {
              var inRatio  = viewBox.width / viewBox.height,
                  outRatio = owidth / oheight;
              var meetFlag = aspect.meetOrSlice !== aspect.SVG_MEETORSLICE_SLICE;
              var fillAxis = outRatio>inRatio ? (meetFlag?'y':'x') : (meetFlag?'x':'y');
              if (fillAxis==='x'){
                height = width/outRatio;
                var diff = viewBox.height - height;
                switch (aspect.align){
                  case aspect.SVG_PRESERVEASPECTRATIO_UNKNOWN: 
                  case aspect.SVG_PRESERVEASPECTRATIO_XMINYMID:
                  case aspect.SVG_PRESERVEASPECTRATIO_XMIDYMID:
                  case aspect.SVG_PRESERVEASPECTRATIO_XMAXYMID:
                    y += diff/2;
                  break;
                  case aspect.SVG_PRESERVEASPECTRATIO_XMINYMAX:
                  case aspect.SVG_PRESERVEASPECTRATIO_XMIDYMAX:
                  case aspect.SVG_PRESERVEASPECTRATIO_XMAXYMAX:
                    y += diff;
                  break;
                }
              }
              else{
                width = height*outRatio;
                var diff = viewBox.width - width;
                switch (aspect.align){
                  case aspect.SVG_PRESERVEASPECTRATIO_UNKNOWN: 
                  case aspect.SVG_PRESERVEASPECTRATIO_XMIDYMIN:
                  case aspect.SVG_PRESERVEASPECTRATIO_XMIDYMID:
                  case aspect.SVG_PRESERVEASPECTRATIO_XMIDYMAX:
                    x += diff/2;
                  break;
                  case aspect.SVG_PRESERVEASPECTRATIO_XMAXYMID:
                  case aspect.SVG_PRESERVEASPECTRATIO_XMAXYMIN:
                  case aspect.SVG_PRESERVEASPECTRATIO_XMAXYMAX:
                    x += diff;
                  break;
                }
              }
              oBack = {x:x,y:y,width:width,height:height};
            }
            // Return positively
            return oBack;
          } catch (ex) {
            return null;
          }
        },
        /**
         * collectionCsvDownload
         *    Perform the actual Csv downloading
         *    Note: the [oData] object has:
         *    - rowheaders
         *    - columnheaders
         *    - table: one-dimensional, contains all data rows after one another
         * 
         * @param {object} oData
         * @param {string} filename_append
         * @returns {Boolean}
         */
        collectionCsvDownload : function(oData, filename_append) {
          var downloadoptions = {}, // Download options
              i, j,                 // Counter
              idx,                  // Other index
              sLine = "",           // One line
              lCsv = [],            // List of csv parts
              brokerdatacsv = "";   // CSV data as string
          
          try {
            // Set the download options
            downloadoptions.extension = "csv";
            downloadoptions.mimetype = "application/json";  // WHY???
            downloadoptions.filename = filename_append;
            
            // Header depends on output type
            switch (filename_append) {
              case "alldocs":
                // Phase #1: header
                // First header is empty
                sLine = "\"\"";
                // Get the headers
                for (i=0;i<oData.columnheaders.length;i++) {
                  sLine = sLine + "\t\"" + oData.columnheaders[i] + "\"";
                }
                lCsv.push(sLine);
                
                // Phase #2: Lines
                idx = 0;    // Index within oData.table
                // Walk the lines, which are the MFWs
                for (i=0;i<oData.rowheaders.length;i++) {
                  // Add the row header
                  sLine = "\""+oData.rowheaders[i]+"\"";
                  // Add the row contents
                  for (j = 0; j<oData.columnheaders.length;j++) {
                    sLine += "\t" + oData.table[idx++];
                  }
                  lCsv.push(sLine);
                }
                break;
              case "stylo-pca":
                // Phase #1: header
                // First header is empty
                sLine = "\"\"";
                // Get the headers
                for (i=0;i<oData.columnheaders.length;i++) {
                  sLine = sLine + "\t\"" + oData.columnheaders[i] + "\"";
                }
                lCsv.push(sLine);
                
                // Phase #2: Lines
                // Walk the lines, which are the MFWs
                for (i=0;i<oData.table.length;i++) {
                  var lRow = oData.table[i];
                  // Add the row header
                  sLine = "\""+oData.rowheaders[i]+"\"";
                  // Add the row contents
                  for (j = 0; j<lRow.length;j++) {
                    sLine += "\t" + lRow[j];
                  }
                  lCsv.push(sLine);
                }
                break;
              default:
                // Unsupported type
                return false;
            }
            
            brokerdatacsv = lCsv.join("\n");
            downloadoptions.data = brokerdatacsv;
            // Use the generic nederlab download function
            nederlab.utilities.triggerAnyDataDownload(downloadoptions);
            
            // Return positively
            return true;
          } catch (ex) {
            return false;
          }
        },
        /**
         * collectionSvgDownload
         *    Perform the actual Svg downloading
         * 
         * @param {string} sData
         * @param {string} filename_append
         * @returns {Boolean}
         */
        collectionSvgDownload : function(sData, filename_append) {
          var downloadoptions = {};   // Download options
          
          try {
            // Set the download options
            downloadoptions.extension = "svg";              // This is SVG output
            downloadoptions.mimetype = "application/json";  // WHY???
            downloadoptions.filename = filename_append;

            downloadoptions.data = sData;
            // Use the generic nederlab download function
            nederlab.utilities.triggerAnyDataDownload(downloadoptions);
            
            // Return positively
            return true;
          } catch (ex) {
            return false;
          }
        },        
        doInit : function() {
          var html = [];
          
          try {
            // This task is now executed separately
            // html.push("<option value='freq'>frequenties</option>");
            
            // Initialise a listbox
            html.push("<option value='corpus'>teksten</option>");
            html.push("<option value='mfw'>MFW list</option>");
            html.push("<option value='st-ana'>stylo: principle components</option>");
            html.push("<option value='st-clus'>stylo: cluster analysis</option>");
            // Th3e following two can be removed in the production environment
            html.push("<option value='st-ana-loc'>local: (principle components)</option>");
            html.push("<option value='st-clus-loc'>local: (cluster analysis)</option>");
            $("#stylo-task-sel").html(html.join("\n"));
            // Other initializations
            loc_bCorpusDone = false;
            // Return positively
            return true;
          } catch (err) {
            private_methods.showMessage("Fout in [doInit]: " + err.message);
            // Return failure
            return false;
          }
        },
        /**
         * doCaThroughNstylo
         *    Perform CA (Cluster Analysis) through the NSTYLO service
         * 
         * @param {list}    lData
         * @param {object}  options
         * @returns {undefined}
         */
        doCaThroughNstylo : function(lData, options) {
          var retval = {},
              divVisualisation = "stylo-visualisatie",
              divVisualisation2 = "stylo-visualisatie2",
              divVisualisation3 = "stylo-visualisatie3",
              fields = null;
          
          try {
            // Validate
            if (lData === undefined || lData === null || lData.length === 0) {
              return false;
            }

            // Post the parameters as JSON
            fields = {'table': JSON.stringify(lData), 'owner': 'erwin', 'method': 'ca'};

            // Define the options
            options['query'] = fields;
            options['command'] = "ntable";
            
            // Define the legend
            options['legend'] = lData['nrows'].toString() + " MFW Culled @ 0%\n" +
                    options['distancemethod'];

            // Ask the broker (synchronously)
            retval = private_methods.askNstylo(options, function(response) {
              var oContents = null;
              
              // Check the reaction
              if (response !== undefined && response !== null && 'status' in response) {
                switch(response.status.toLowerCase()) {
                  case "ok":
                    // Show the message we received
                    private_methods.showNstyloMsg(response['html']);
                    // And clear the main message
                    private_methods.showMessage("");
                    // Get the contents returned by NSTYLO
                    if ('contents' in response) {
                      oContents = response['contents'];
                      oContents['legend'] = options['legend'];
                      // Visualize the contents through different methods
                      private_methods.showCaResults(divVisualisation, oContents, "network");
                      private_methods.showCaResults(divVisualisation2, oContents, "graph");
                      private_methods.showCaResults(divVisualisation3, oContents, "dendro");
                      // Copy the contents locally
                      loc_oPcaTable = JSON.parse(JSON.stringify(oContents));
                      // Show the download-svg button
                      $("#stylometry-svg").removeClass("hidden");
                      $("#stylometry-network").removeClass("hidden");
                      $("#stylometry-dendro").removeClass("hidden");
                      $("#stylometry-graph").removeClass("hidden");
                      // Show the download button
                      $("#stylometry-download-pca").removeClass("hidden");
                      
                      // Initially show visualisation #1
                      private_methods.showVisualisation(1);
                    }
                    break;
                  default:
                    if ('html' in response) {
                      private_methods.showMessage(response['html']);
                    } else {
                      private_methods.showMessage("The nstylo service returned an error");
                    }
                    break;
                }
              } else {
                private_methods.showMessage("Could not get a proprer reply from the nstylo service");
              }
            });
            
            
            // Indicate all is well
            return true;
          } catch (err) {
            private_methods.showMessage("Fout in [doCaThroughNstylo]: " + err.message);
            // Signal error
            return false;
          }
        },        
        /**
         * doPcaThroughNstylo
         *    Perform PCA through the NSTYLO service
         * 
         * @param {list}    lData
         * @param {object}  options
         * @returns {undefined}
         */
        doPcaThroughNstylo : function(lData, options) {
          var retval = {},
              divVisualisation = "stylo-visualisatie",
              fields = null;
          
          try {
            // Validate
            if (lData === undefined || lData === null || lData.length === 0) {
              return false;
            }

            // Post the parameters as JSON
            fields = {'table': JSON.stringify(lData), 'owner': 'erwin', 'method': 'pca'};

            // Define the options
            options['query'] = fields;
            options['command'] = "ntable";

            // Define the legend
            options['legend'] = lData['nrows'].toString() + " MFW Culled @ 0%\n" +
                    options['distancemethod'];

            // Ask the broker (synchronously)
            retval = private_methods.askNstylo(options, function(response) {
              var oContents = null;
              
              // Check the reaction
              if (response !== undefined && response !== null && 'status' in response) {
                switch(response.status.toLowerCase()) {
                  case "ok":
                    // Show the message we received
                    private_methods.showNstyloMsg(response['html']);
                    // And clear the main message
                    private_methods.showMessage("");
                    // Get the contents returned by NSTYLO
                    if ('contents' in response) {
                      oContents = response['contents'];
                      oContents['legend'] = options['legend'];
                      // Visualize the contents
                      private_methods.showPcaResults(divVisualisation, oContents);
                      // Copy the contents locally
                      loc_oPcaTable = JSON.parse(JSON.stringify(oContents));
                      // Show the download-svg button
                      $("#stylometry-svg").removeClass("hidden");
                      $("#stylometry-network").addClass("hidden");
                      $("#stylometry-dendro").addClass("hidden");
                      $("#stylometry-graph").addClass("hidden");
                      $("#stylometry-download-pca").removeClass("hidden");
                      // Enable showing visualisation
                      private_methods.showVisualisation();
                    }
                    break;
                  default:
                    if ('html' in response) {
                      private_methods.showMessage(response['html']);
                    } else {
                      private_methods.showMessage("The nstylo service returned an error");
                    }
                    break;
                }
              } else {
                private_methods.showMessage("Could not get a proprer reply from the nstylo service");
              }
            });
            
            
            // Indicate all is well
            return true;
          } catch (err) {
            private_methods.showMessage("Fout in [doPcaThroughNstylo]: " + err.message);
            // Signal error
            return false;
          }
        },        
        /**
         * downloadCsvData
         *    Download data of type options.type in CSV format
         * 
         * @param {object} options
         * @returns {Boolean}
         */
        downloadCsvData : function(options) {
          var lData = [],   // CSV data in an array
              oData = {},   // CSV data object
              downloadoptions = {};
          
          try {
            // Validate
            if (options === undefined || !options.hasOwnProperty("type") ||
                    !options.hasOwnProperty("userinfo")) {
              private_methods.showMessage("DownloadCsvData: missing parameter");
              return false;
            }
            
            // Show that we are working
            $("#stylometry-loading").removeClass("hidden");
            
            // Collecting data depends on the output type
            switch (options.type) {
              case "alldocs":
                // Convert the available data into a table
                oData = private_methods.getOutputResultsObject(options.type);
                break;
              case "stylo-pca":
                // Put the PCA data into a table
                oData = private_methods.getPcaResultsObject(options.type);
                break;
            }
            
            // Set the downloadoptions
            downloadoptions.data = oData;
            downloadoptions.type = options.type;
            downloadoptions.async = true;
            downloadoptions.callbackfunction = nederlab.stylometry.processCsvDownload;
            downloadoptions.userinfo = options.userinfo;
            
            // Start off the data retrieval
            private_methods.retrieveData(downloadoptions);
            
            // Show that we are working
            $("#stylometry-loading").addClass("hidden");
            // Return positively
            return true;
          } catch (ex) {
            return false;
          }
        },
        
        /**
         * convertSvgToString
         *    Given an SVG image at DOM el, convert this to a string
         *    including the correct styles.
         *    
         *    See: https://github.com/exupero/saveSvgAsPng
         * 
         * @param {div} divSvg
         * @returns {undefined}
         */
        convertSvgToString : function(divSvg) {
          var lData = [],
              used = "",
              sheets = document.styleSheets,
              rules,
              rule,
              j,i,
              elems,
              el;
          
          try {
            // Get the <svg> root of the image
            el = $("#stylo-visualisatie svg").first().get(0);
            // Get all the styles used by the svg
            for (i=0;i<sheets.length;i++) {
              rules = sheets[i].cssRules;
              for (j=0;j<rules.length;j++) {
                rule = rules[j];
                if (typeof(rule.style) !== "undefined") {
                  elems = el.querySelectorAll(rule.selectorText);
                  if (elems.length > 0) {
                    used += rule.selectorText + " { " + rule.style.cssText + " }\n";
                  }
                }
              }
            }
            var s = document.createElement('style');
            s.setAttribute('type', 'text/css');
            s.innerHTML = "<![CDATA[\n" + used + "\n]]>";

            var defs = document.createElement('defs');
            defs.appendChild(s);
            el.insertBefore(defs, el.firstChild);  
            
            el.setAttribute("version", "1.1");
            el.setAttribute("xmlns", "http://www.w3.org/2000/svg");
            el.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");            
            
            // The data to be downloaded consists of a header and the svg image
            lData.push("<?xml version=\"1.0\" standalone=\"no\"?>");
            lData.push("<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\" >");
            lData.push(el.outerHTML);

            // Return what has been made
            return lData.join("\n");
          } catch (ex) {
            private_methods.showMessage("Fout in [convertSvgToString]: " + ex.message);
            return "";
          }
        },
        /**
         * downloadImage
         *    Download the image in the type specified in options
         * 
         * @param {object} options
         * @returns {Boolean}
         */
        downloadImage : function(options) {
          var sData = "",   // The image we are intending to download
              lData = [],
              used = "",
              sheets = document.styleSheets,
              rules,
              rule,
              j,i,
              elems,
              el,
              downloadoptions = {};
          
          try {
            // Validate
            if (options === undefined || !options.hasOwnProperty("type") ||
                    !options.hasOwnProperty("userinfo")) {
              private_methods.showMessage("downloadImage: missing parameter");
              return false;
            }
            
            // Show that we are working
            $("#stylometry-loading").removeClass("hidden");
            
            // Convert the SVG image to a string
            sData = private_methods.convertSvgToString($("#stylo-visualisatie svg").first());
            
            // Set the downloadoptions
            downloadoptions.data = sData;
            downloadoptions.type = options.type;
            downloadoptions.async = true;
            downloadoptions.callbackfunction = nederlab.stylometry.processSvgDownload;
            downloadoptions.userinfo = options.userinfo;
            
            // Start off the data retrieval
            private_methods.retrieveData(downloadoptions);
            
            // Show that we are working
            $("#stylometry-loading").addClass("hidden");
            // Return positively
            return true;
          } catch (ex) {
            private_methods.showMessage("Fout in [downloadImage]: " + ex.message);
            return false;
          }
        },
        /**
         * getAuthorInfo
         *    Retrieve the information on the authors step by step
         * 
         * @param {object} qdict
         * @returns {Boolean}
         */
        getAuthorInfo : function(qdict) {
          var i,j,k,              // Counters
              idx,                // Index in author array
              iDocsPerPage = 50,  // Number of docus per page
              iPages = 0,         // Number of pages
              iStart = 0,         // Starting page
              oInfo = {},         // One info object
              oTitle = {},        // Title-oriented information object
              lAuthors = [],      // List of author info
              lAuthorId = [],     // List of author ids
              oAuthor = {},       // Information on one author
              options = {},       // Object with options
              sAbbr = "",         // Abbreviation for author+title to be used in STYLO
              sT;
              
          try {
            // Reset the existing global array
            loc_lAuthorInfo = [];
            loc_lTitleInfo = [];
            // Divide the total amount in pages of max [iDocsPerPage] documents
            iPages = Math.ceil(loc_iDocTotal / iDocsPerPage);
            options['pagesize'] = iDocsPerPage;
            // Loop through all pages
            for (i=0;i<iPages;i++) {
              // Show progress
              private_methods.showMessage("Auteurinformatie ophalen: "+(i+1)+"/"+iPages+". Auteurs="+lAuthorId.length);
              // Determine where to start
              iStart = i * iDocsPerPage;
              // Search this batch
              if (private_methods.searchTexts(qdict, iStart, options)) {
                // Get all the author information 
                for (j=0;j<loc_lDocInfo.length;j++) {
                  // Get the doc info object
                  oInfo = loc_lDocInfo[j];
                  // Get the list of authors
                  lAuthors = oInfo['authors'];
                  for (k=0;k<lAuthors.length;k++) {
                    // Add this author (if it is not in there yet)
                    idx = $.inArray(lAuthors[k]['id'], lAuthorId);
                    if (idx<0) {
                      // Add id to array
                      lAuthorId.push(lAuthors[k]['id']);
                      // Add author information to list
                      loc_lAuthorInfo.push(lAuthors[k]);
                      // Access the author
                      oAuthor = loc_lAuthorInfo[loc_lAuthorInfo.length-1];
                    } else {
                      oAuthor = loc_lAuthorInfo[idx];
                    }
                    // Add this title to the list of titles for the author
                    if (!('titles' in oAuthor)) {oAuthor['titles'] = [];}
                    oAuthor['titles'].push(oInfo['title']);
                  }
                  // Create an information object for this title
                  sAbbr = lAuthors[0]['lastname']+loc_sReplaceChar+lAuthors[0]['firstname']+"_"+oInfo['title'];
                  sAbbr = sAbbr.replace(/ /g, loc_sReplaceChar);
                  oTitle = {title: oInfo['title'], authors: lAuthors, abbr: sAbbr};
                  // Process the title information
                  // loc_lTitleInfo.push(JSON.parse(JSON.stringify(oInfo['title'])));
                  loc_lTitleInfo.push(JSON.parse(JSON.stringify(oTitle)));
                }
              }
            }
            // Sort the author information
            loc_lAuthorInfo.sort(function(a,b) {
              var aName = a['lastname']+a['fullname'];
              var bName = b['lastname']+b['fullname'];
              return ((aName < bName) ? -1 : ((aName > bName) ? 1 : 0));
            });
            
            // Sort the title information
            loc_lTitleInfo.sort(function(a,b) {
              return ((a['abbr'] < b['abbr']) ? -1 : ((a['abbr'] > b['abbr']) ? 1 : 0));
            });
            
            
            private_methods.showMessage("Aantal betrokken auteurs: "+lAuthorId.length);
            // Return positively
            return true;
          } catch (ex) {
            private_methods.showMessage("Fout in [getAuthorInfo]: " + ex.message);
            return false;
          }
        },
        /**
         * getBoolParam - get a boolean parameter from the qdict
         * 
         * @param {type} qdict
         * @param {type} sParamName
         * @returns {Boolean}
         */
        getBoolParam: function(qdict, sParamName) {
          var bBack = false;
          
          try {
            // Validate
            if (qdict === undefined || qdict === null) return bBack;
            if (sParamName === undefined || sParamName === "") return bBack;
            if (qdict.hasOwnProperty(sParamName))
              bBack = (qdict[sParamName].toString() === "true");
            return bBack;
          } catch (err) {
            private_methods.showMessage("Fout in [getBoolParam]: " + err.message);
            return false;
          }
        },
        /**
         * getDocResults
         *    Ask the broker for 'list' and 'document' results focusing on
         *    - 
         *    - Adhere to the sorting in [sSortDir]
         * 
         * @param {object} oRequest
         * @returns {object}
         */
        getDocResults : function(oRequest) {
          var options,      // Object that is actually sent to the broker
            i,              // Counter
            j,              // Counter
            iDocId="",      // ID of a document
            retval,         // Object returned by the broker
            oInfo = {},     // One element of information
            lInfo = [],     // List of information
            lAuthor = [],   // List of authors
            sFullName = "", // List of author names
            oDoc = {},      // One element of information
            oAuthor = {},   // Author information object
            oItem = {},     // Object of one item
            oBack = {};     // Object we return

          try {
            // Validate
            if (oRequest === undefined || $.isEmptyObject(oRequest)) return oBack;
            if (!oRequest.hasOwnProperty('response') ||
                !oRequest.response.hasOwnProperty('documents') ||
                !oRequest.response.documents.hasOwnProperty("fields") ) return oBack;
        
            // Formulate broker request
            options = {query: oRequest};
            // Ask the broker (synchronously)
            retval = private_methods.askBroker(options);
            // Evaluate the response
            // Check the return status
            if (retval.hasOwnProperty("status") && retval.status.toLowerCase() ==="ok") {
              // Get to the list of document information
              if (retval.data.hasOwnProperty("documents") && retval.data.documents.length > 0) {
                for (i=0;i<retval.data.documents.length;i++) {
                  // Access the information of this particular document
                  oDoc = retval.data.documents[i];
                  // Get the id
                  iDocId = oDoc['NLCore_NLIdentification_nederlabID'];
                  // Create a new document information element
                  oInfo = {};
                  oInfo['docid'] = iDocId;
                  oInfo['title'] = private_methods.getStringParam(oDoc, 'NLTitle_title');
                  oInfo['genres'] = private_methods.getStringListParam(oDoc, 'NLTitle_genre');
                  oInfo['year'] = private_methods.getIntParam(oDoc, 'NLTitle_yearOfPublicationMin');
                  oInfo['edition'] = private_methods.getStringParam(oDoc, 'NLTitle_edition');
                  sFullName = "";
                  lAuthor = [];
                  // Look for author information
                  if (oDoc.hasOwnProperty("authorinfo") && oDoc.authorinfo.hasOwnProperty("documents") &&
                          oDoc.authorinfo.documents.length > 0) {
                    for (j=0;j< oDoc.authorinfo.documents.length;j++) {
                      oItem = oDoc.authorinfo.documents[j];
                      oAuthor['lastname'] = private_methods.getStringParam(oItem, 'NLPerson_NLPersonName_preferredLastName');
                      oAuthor['firstname'] = private_methods.getStringParam(oItem, 'NLPerson_NLPersonName_preferredFirstName');
                      oAuthor['fullname'] = private_methods.getStringParam(oItem, 'NLPerson_NLPersonName_preferredFullName');
                      oAuthor['birthyear'] = private_methods.getIntParam(oItem, 'NLPerson_yearOfBirthMin');
                      oAuthor['deathyear'] = private_methods.getIntParam(oItem, 'NLPerson_yearOfDeathMin');
                      oAuthor['gender'] = private_methods.getStringParam(oItem, 'NLPerson_gender');
                      oAuthor['id'] = private_methods.getStringParam(oItem, 'NLCore_NLIdentification_nederlabID');
                      lAuthor.push(JSON.parse(JSON.stringify(oAuthor)));
                      if (sFullName !== "") sFullName += ", ";
                      sFullName += oAuthor['lastname'];
                    }
                  } else {
                    oAuthor['lastname'] = "unknown";
                    oAuthor['firstname'] = "unknown";
                    oAuthor['fullname'] = "unknown";
                    oAuthor['birthyear'] = 0;
                    oAuthor['deathyear'] = 0;
                    oAuthor['gender'] = "unknown";
                    lAuthor.push(JSON.parse(JSON.stringify(oAuthor)));
                    sFullName ="unknown";
                  }
                  // Add the list of author information
                  oInfo['authors'] = lAuthor;
                  oInfo['fullname'] = sFullName;
                  // Add the information to the list of information
                  lInfo.push(oInfo);
                }
              }
            }
            // State the document information
            oBack['info'] = lInfo;
            // Return what we have
            return oBack;
          } catch (err) {
            private_methods.showMessage("Fout in [getDocResults]: " + err.message);
            return oBack;
          }
        },
        /**
         * getDocSizes
         *    Retrieve the sizes of the current document, also giving the
         *    minimum and the maximum size
         * 
         * @returns {object}
         */
        getDocSizes : function() {
          var oBack = {},   // What we return
              lSize = [],   // Array with sizes
              i,            // Counter
              iMin = 0,     // Minimum size
              iMax = 0;     // Maximum size
              
          try {
            // Can we do anytyhing?
            if (loc_lResultFreq === null || loc_lResultFreq.length === 0) {
              return oBack;
            }
            // Initialize min and max
            iMin = loc_lResultFreq[0].total;
            iMax = iMin;
            for (i=0;i<loc_lResultFreq.length;i++ ) {
              lSize.push(loc_lResultFreq[i].total);
              if (loc_lResultFreq[i].total > iMax) {
                iMax = loc_lResultFreq[i].total;
              }
              if (loc_lResultFreq[i].total < iMin) {
                iMin = loc_lResultFreq[i].total;
              }
            }
            // Construct what we return
            oBack['min'] = iMin;
            oBack['max'] = iMax;
            oBack['sizes'] = lSize;
            
            // Return what we found
            return oBack;
          } catch (err) {
            private_methods.showMessage("Fout in [getDocSizes]: " + err.message);
            return {};
          }
        },
        /**
         * getFieldParam - get an object parameter from the qdict
         * 
         * @param {type} qdict
         * @param {type} sParamName
         * @param {type} sFieldName
         * @returns {object}
         */
        getFieldParam: function(qdict, sParamName, sFieldName) {
          var oBack = {},
              oParam = {};
          
          try {
            // Validate
            if (qdict === undefined || qdict === null) return oBack;
            if (sParamName === undefined || sParamName === "") return oBack;
            if (sFieldName === undefined || sFieldName ==="") return oBack;
            if (qdict.hasOwnProperty(sParamName)) {
              // Get the parameter object
              oParam = qdict[sParamName];
              if (oParam !== undefined && oParam !== null && !$.isEmptyObject(oParam)) {
                // Does this object have a [sFieldName] property?
                if (oParam.hasOwnProperty(sFieldName)) {
                  // Then that should be returned
                  oBack = oParam[sFieldName];
                }
              }
            }
            // Return what we have found
            return oBack;
          } catch (err) {
            private_methods.showMessage("Fout in [getFieldParam]: " + err.message);
            return oBack;
          }
        },
        /**
         * getFtableResults
         *    Send the [oRequest] to the broker and process the results
         *    The request is expected to contain sections:
         *     mtas.document
         *     mtas.termvector
         *     mtas.stats
         * 
         * @param {object}  oRequest
         * @returns {object}
         */
        getFtableResults : function(oRequest) {
          var options,      // Object that is actually sent to the broker
            i,              // Counter
            j,              // Counter
            iDoc,           // Index of document
            iMainHits,      // Main number of hits identified by the 'global' stats
            retval,         // Object returned by the broker
            oTerm = {},     // Termvector response object
            oDocInfo = {},  // Document information: contains documentKey and list
            oDoc = {},      // One document
            oMfwDoc = {},   // MFW per doc
            data,           // The [data] object returned
            oStats,         // Stats object
            iFreq,          // Hit frequency (integer)
            iDocs,          // Document frequency (integer)
            sLemma,         // Lemma (string)
            sAbbr,          // Abbreviation of author name + doc title
            sDocKey,        // Document key
            sWord,          // Word (string)
            // sMethod = "async",  // Use asynchronous method or not
            lHits = [],     // List with hit objects
            lDocs = [],     // Documents
            lDocInfo = [],  // List with document information
            oBack = {},     // Object we return
            oAuthor = {},   // Information on one author
            lMfwDoc = [],   // MFW per doc
            lDocFreq = [],  // List of frequencies per doc
            lMfwList = [],  // List of MFW (overall)
            lMfw = [];      // List of most-frequent-words (overall)
          
          try {
            // Validate
            if (oRequest === undefined || $.isEmptyObject(oRequest)) return oBack;
            if (!oRequest.hasOwnProperty('response') ||
                !oRequest.response.hasOwnProperty('mtas') ||
                !oRequest.response.mtas.hasOwnProperty("stats") ||
                !oRequest.response.mtas.hasOwnProperty("document") ||
                !oRequest.response.mtas.hasOwnProperty("termvector")) return oBack;
        
            // Formulate broker request
            options = {query: oRequest};
            // Ask the broker (synchronously)
            retval = private_methods.askBroker(options);
            // Evaluate the response
            // Check the return status
            if (retval.hasOwnProperty("status") && retval.status.toLowerCase() ==="ok") {
              // Retrieve the list of documents
              if (retval.hasOwnProperty("data") 
                      && retval.data.hasOwnProperty("mtas")) {
                data = retval.data;
                if (data.hasOwnProperty("stats")) {
                  oStats = data.stats;
                  // For comparison: get the number of hits provided by the global stats
                  iMainHits = oStats['total'];    
                  
                  // Get the information per document
                  if (data.hasOwnProperty("documents")) {
                    lDocs = data.documents;
                  }
                  
                  // Get to the MTAS-STAS information
                  if (data.hasOwnProperty("mtas") && 
                          data.mtas.hasOwnProperty("stats") &&
                          data.mtas.stats.hasOwnProperty("tokens") &&
                          data.mtas.stats.tokens.length > 0) {
                    // Get the MTAS stats object
                    oStats = data.mtas.stats.tokens[0];
                    // Extract the number of hits and docs
                    loc_iDocTotal = oStats['n'];
                    // Also add this information to the object we return
                    oBack['total'] = oStats['sum'];
                    oBack['docs'] = oStats['n'];
                  }
                  
                  // Get the MTAS-TERMVECTOR information: the overall MFW list
                  if (data.hasOwnProperty("mtas") && 
                      data.mtas.hasOwnProperty("termvector") && 
                      data.mtas.termvector.length > 0 &&
                      data.mtas.termvector[0].hasOwnProperty("list")) {
                    // Get the list of MFW objects
                    lHits = data.mtas.termvector[0].list;
                    // Walk this list
                    for (i=0;i<lHits.length;i++) {
                      // Retrieve this object
                      oTerm = lHits[i];
                      // Get the document ('n') and hit ('sum') frequencies
                      iDocs = oTerm['n'];
                      iFreq = oTerm['sum'];
                      sWord = oTerm['key'];
                      lMfw.push({freq: iFreq, docs: iDocs, lemma: sWord});
                      lMfwList.push(sWord);
                    }
                    // Add the MFW info
                    oBack['mfw'] = lMfw;
                    oBack['mfwlist'] = lMfwList.join("|");
                  }
                  
                  // Get the MTAS-DOCUMENT information: mfw list per document
                  if (data.hasOwnProperty("mtas") && 
                      data.mtas.hasOwnProperty("document") && 
                      data.mtas.document.length > 0 &&
                      data.mtas.document[0].hasOwnProperty("list")) {
                    // Get the list of document-information-objects
                    lDocInfo = data.mtas.document[0].list;
                    // Walk the list of document-information-objects
                    for (i=0;i<lDocInfo.length;i++) {
                      oDocInfo = lDocInfo[i];
                      // Get the key of this document
                      sDocKey = oDocInfo['documentKey'];
                      // Retrieve the information for this document
                      iDoc = -1;
                      for (j=0;j<lDocs.length;j++) {
                        oDoc = lDocs[j];
                        if (oDoc['NLCore_NLIdentification_nederlabID'] === sDocKey) {
                          iDoc = j; break;
                        }
                      }
                      if (iDoc >=0) {
                        // Copy the 'documents' information
                        oMfwDoc = JSON.parse(JSON.stringify(lDocs[iDoc]));
                        // Copy the frequency information: in order of the lMfw above
                        lDocFreq = [];
                        for (j=0;j<lMfw.length;j++) {
                          sWord = lMfw[j]['lemma'];
                          // Get the frequency of this word in the current document
                          lDocFreq.push({word: sWord, freq: private_methods.getWordFreqInList(sWord, oDocInfo.list)});
                        }
                        oMfwDoc['list'] = JSON.parse(JSON.stringify(lDocFreq));
                        // Also add the total number of words in this document
                        oMfwDoc['total'] = oDocInfo['sum'];
                        // Create an abbreviation of the author + document title
                        oAuthor = oMfwDoc['authorinfo'].documents[0];
                        sAbbr = oAuthor['NLPerson_NLPersonName_preferredLastName'] + loc_sReplaceChar +
                                oAuthor['NLPerson_NLPersonName_preferredFirstName'] + "_" +
                                oMfwDoc['NLTitle_title'];
                        sAbbr = sAbbr.replace(/ /g, loc_sReplaceChar);
                        oMfwDoc['abbr'] = sAbbr;
                        // Add the mfwdoc to the list
                        lMfwDoc.push(oMfwDoc);
                      }
                    }
                    // Add the information
                    oBack['doc'] = lMfwDoc;
                  }
                }
              }
            } else if (retval.hasOwnProperty("status") && retval.status.toLowerCase() ==="error") {
              // Show the errors
              private_methods.showMessage(
                "Fout in [getGroupResults]: askBroker returns errors." +
                "<table>"+
                "<tr><td>status:</td><td>"+retval.data.status+"</td></tr>" +
                "<tr><td>text:</td><td>"+retval.data.text+"</td></tr>" +
                "<tr><td>error:</td><td>"+retval.data.error+"</td></tr>" +
                "</table>"
              );
            }
            // Return what we found
            return oBack;
          } catch (err) {
            private_methods.showMessage("Fout in [getFtableResults]: " + err.message);
            return oBack;
          }
        },
        /**
         * getIntParam - get a numerical parameter from the qdict
         *  
         * @param {object} qdict
         * @param {string} sParamName
         * @param {int}    iDefault
         * @returns {Number}
         */
        getIntParam: function(qdict, sParamName, iDefault) {
          var iBack = 0,  // Integer value
            sBack = "";   // Value as string
          
          try {
            // Validate
            if (qdict === undefined || qdict === null) return -1;
            if (sParamName === undefined || sParamName === "") return -1;
            if (qdict.hasOwnProperty(sParamName)) {
              sBack = qdict[sParamName];
              if (/^\+?(0|[1-9]\d*)$/.test(sBack)) {
                iBack = Number(sBack);
              }
            } else if (iDefault !== undefined) {
              iBack = iDefault;
            }
            // Return what we have found
            return iBack;
          } catch (err) {
            private_methods.showMessage("Fout in [getIntParam]: " + err.message);
            return -1;
          }
        },
        /**
         * getMfwPerDoc
         *    Send an [oRequest] to the broker and process the results
         *    The request is expected to contain sections:
         *     mtas.document
         *     mtas.stats
         * 
         * @param {object}  oRequest
         * @param {list}    lMfwList
         * @returns {object}
         */
        getMfwPerDoc : function(oRequest, lMfwList) {
          var options,      // Object that is actually sent to the broker
            i,              // Counter
            j,              // Counter
            iDoc,           // Index of document
            iMainHits,      // Main number of hits identified by the 'global' stats
            retval,         // Object returned by the broker
            oDocInfo = {},  // Document information: contains documentKey and list
            oDoc = {},      // One document
            oMfwDoc = {},   // MFW per doc
            data,           // The [data] object returned
            oStats,         // Stats object
            sAbbr,          // Abbreviation of author name + doc title
            sDocKey,        // Document key
            sWord,          // Word (string)
            // sMethod = "async",  // Use asynchronous method or not
            lDocs = [],     // Documents
            lDocInfo = [],  // List with document information
            oBack = {},     // Object we return
            oAuthor = {},   // Information on one author
            lMfwDoc = [],   // MFW per doc
            lDocFreq = [];  // List of frequencies per doc
          
          try {
            // Validate
            if (oRequest === undefined || $.isEmptyObject(oRequest)) return oBack;
            if (!oRequest.hasOwnProperty('response') ||
                !oRequest.response.hasOwnProperty('mtas') ||
                !oRequest.response.mtas.hasOwnProperty("stats") ||
                !oRequest.response.mtas.hasOwnProperty("document") ) return oBack;
        
            // Formulate broker request
            options = {query: oRequest};
            // Ask the broker (synchronously)
            retval = private_methods.askBroker(options);
            // Evaluate the response
            // Check the return status
            if (retval.hasOwnProperty("status") && retval.status.toLowerCase() ==="ok") {
              // Retrieve the list of documents
              if (retval.hasOwnProperty("data") 
                      && retval.data.hasOwnProperty("mtas")) {
                data = retval.data;
                if (data.hasOwnProperty("stats")) {
                  oStats = data.stats;
                  // For comparison: get the number of hits provided by the global stats
                  iMainHits = oStats['total'];    
                  
                  // Get the information per document
                  if (data.hasOwnProperty("documents")) {
                    lDocs = data.documents;
                  }
                  
                  // Get to the MTAS-STAS information
                  if (data.hasOwnProperty("mtas") && 
                          data.mtas.hasOwnProperty("stats") &&
                          data.mtas.stats.hasOwnProperty("tokens") &&
                          data.mtas.stats.tokens.length > 0) {
                    // Get the MTAS stats object
                    oStats = data.mtas.stats.tokens[0];
                    // Extract the number of hits and docs
                    loc_iDocTotal = oStats['n'];
                    // Also add this information to the object we return
                    oBack['total'] = oStats['sum'];
                    oBack['docs'] = oStats['n'];
                  }
                  
                  // Get the MTAS-DOCUMENT information: mfw list per document
                  if (data.hasOwnProperty("mtas") && 
                      data.mtas.hasOwnProperty("document") && 
                      data.mtas.document.length > 0 &&
                      data.mtas.document[0].hasOwnProperty("list")) {
                    // Get the list of document-information-objects
                    lDocInfo = data.mtas.document[0].list;
                    // Walk the list of document-information-objects
                    for (i=0;i<lDocInfo.length;i++) {
                      oDocInfo = lDocInfo[i];
                      // Get the key of this document
                      sDocKey = oDocInfo['documentKey'];
                      // Retrieve the information for this document
                      iDoc = -1;
                      for (j=0;j<lDocs.length;j++) {
                        oDoc = lDocs[j];
                        if (oDoc['NLCore_NLIdentification_nederlabID'] === sDocKey) {
                          iDoc = j; break;
                        }
                      }
                      if (iDoc >=0) {
                        // Copy the 'documents' information
                        oMfwDoc = JSON.parse(JSON.stringify(lDocs[iDoc]));
                        // Copy the frequency information: in order of the lMfw above
                        lDocFreq = [];
                        for (j=0;j<lMfwList.length;j++) {
                          sWord = lMfwList[j];
                          // Get the frequency of this word in the current document
                          lDocFreq.push({word: sWord, freq: private_methods.getWordFreqInList(sWord, oDocInfo.list)});
                        }
                        oMfwDoc['list'] = JSON.parse(JSON.stringify(lDocFreq));
                        // Also add the total number of words in this document
                        oMfwDoc['total'] = oDocInfo['sum'];
                        oMfwDoc['positions'] = oMfwDoc['NLContent_mtas_numberOfPositions'];
                        // Check for unknown authors
                        if (oMfwDoc['authorinfo'].documents.length ===0) {
                          sAbbr = "unknown";
                        } else {
                          // Create an abbreviation of the author + document title
                          oAuthor = oMfwDoc['authorinfo'].documents[0];
                          sAbbr = oAuthor['NLPerson_NLPersonName_preferredLastName'] +loc_sReplaceChar +
                                  oAuthor['NLPerson_NLPersonName_preferredFirstName'] + "_" +
                                  oMfwDoc['NLTitle_title'];
                          sAbbr = sAbbr.replace(/ /g, loc_sReplaceChar);
                        }
                        oMfwDoc['abbr'] = sAbbr;
                        // Add the mfwdoc to the list
                        lMfwDoc.push(oMfwDoc);
                      }
                    }
                    // Add the information
                    oBack['doc'] = lMfwDoc;
                  }
                }
              }
            } else if (retval.hasOwnProperty("status") && retval.status.toLowerCase() ==="error") {
              // Show the errors
              private_methods.showMessage(
                "Fout in [getGroupResults]: askBroker returns errors." +
                "<table>"+
                "<tr><td>status:</td><td>"+retval.data.status+"</td></tr>" +
                "<tr><td>text:</td><td>"+retval.data.text+"</td></tr>" +
                "<tr><td>error:</td><td>"+retval.data.error+"</td></tr>" +
                "</table>"
              );
            }
            // Return what we found
            return oBack;
          } catch (err) {
            private_methods.showMessage("Fout in [getMfwPerDoc]: " + err.message);
            return null;
          }
        },
        /**
         * getMfwResults
         *    Send [oRequest] to the broker and process the results
         *    The request is expected to contain sections:
         *     mtas.termvector
         * 
         * @param {object}  oRequest
         * @returns {object}
         */
        getMfwResults : function(oRequest) {
          var options,      // Object that is actually sent to the broker
            i,              // Counter
            j,              // Counter
            iMainHits,      // Main number of hits identified by the 'global' stats
            retval,         // Object returned by the broker
            oTerm = {},     // Termvector response object
            data,           // The [data] object returned
            oStats,         // Stats object
            iFreq,          // Hit frequency (integer)
            iDocs,          // Document frequency (integer)
            sWord,          // Word (string)
            // sMethod = "async",  // Use asynchronous method or not
            lHits = [],     // List with hit objects
            oBack = {},     // Object we return
            lMfwList = [],  // List of MFW (overall)
            lMfw = [];      // List of most-frequent-words (overall)
          
          try {
            // Validate
            if (oRequest === undefined || $.isEmptyObject(oRequest)) return oBack;
            if (!oRequest.hasOwnProperty('response') ||
                !oRequest.response.hasOwnProperty('mtas') ||
                !oRequest.response.mtas.hasOwnProperty("termvector")) return oBack;
        
            // Formulate broker request
            options = {query: oRequest};
            // Ask the broker (synchronously)
            retval = private_methods.askBroker(options);
            // Evaluate the response
            // Check the return status
            if (retval.hasOwnProperty("status") && retval.status.toLowerCase() ==="ok") {
              // Retrieve the list of documents
              if (retval.hasOwnProperty("data") 
                      && retval.data.hasOwnProperty("mtas")) {
                data = retval.data;
                if (data.hasOwnProperty("stats")) {
                  oStats = data.stats;
                  // For comparison: get the number of hits provided by the global stats
                  iMainHits = oStats['total'];    
                  
                  // Get the MTAS-TERMVECTOR information: the overall MFW list
                  if (data.hasOwnProperty("mtas") && 
                      data.mtas.hasOwnProperty("termvector") && 
                      data.mtas.termvector.length > 0 &&
                      data.mtas.termvector[0].hasOwnProperty("list")) {
                    // Get the list of MFW objects
                    lHits = data.mtas.termvector[0].list;
                    // Walk this list
                    for (i=0;i<lHits.length;i++) {
                      // Retrieve this object
                      oTerm = lHits[i];
                      // Get the document ('n') and hit ('sum') frequencies
                      iDocs = oTerm['n'];
                      iFreq = oTerm['sum'];
                      sWord = oTerm['key'];
                      lMfw.push({freq: iFreq, docs: iDocs, lemma: sWord});
                      lMfwList.push(sWord);
                    }
                    // Add the MFW info
                    oBack['mfw'] = lMfw;
                    oBack['mfwlist'] = lMfwList;
                  }
                  
                }
              }
            } else if (retval.hasOwnProperty("status") && retval.status.toLowerCase() ==="error") {
              // Show the errors
              private_methods.showMessage(
                "Fout in [getGroupResults]: askBroker returns errors." +
                "<table>"+
                "<tr><td>status:</td><td>"+retval.data.status+"</td></tr>" +
                "<tr><td>text:</td><td>"+retval.data.text+"</td></tr>" +
                "<tr><td>error:</td><td>"+retval.data.error+"</td></tr>" +
                "</table>"
              );
            }
            // Return what we found
            return oBack;
          } catch (err) {
            private_methods.showMessage("Fout in [getMfwResults]: " + err.message);
            return oBack;
          }
        },
        /**
         * getMfwResultsG
         *    Send [oRequest] to the broker and process the results
         *    The request is expected to contain sections:
         *     mtas.group (for this getMfwResults "G" version!!)
         * 
         * @param {object}  oRequest
         * @returns {object}
         */
        getMfwResultsG : function(oRequest) {
          var options,      // Object that is actually sent to the broker
            i,              // Counter
            j,              // Counter
            iMainHits,      // Main number of hits identified by the 'global' stats
            retval,         // Object returned by the broker
            oTerm = {},     // Termvector response object
            data,           // The [data] object returned
            oStats,         // Stats object
            iFreq,          // Hit frequency (integer)
            iDocs,          // Document frequency (integer)
            sWord,          // Word (string)
            // sMethod = "async",  // Use asynchronous method or not
            lHits = [],     // List with hit objects
            oBack = {},     // Object we return
            lMfwList = [],  // List of MFW (overall)
            lMfw = [];      // List of most-frequent-words (overall)
          
          try {
            // Validate
            if (oRequest === undefined || $.isEmptyObject(oRequest)) return oBack;
            if (!oRequest.hasOwnProperty('response') ||
                !oRequest.response.hasOwnProperty('mtas') ||
                !oRequest.response.mtas.hasOwnProperty("group")) return oBack;
        
            // Formulate broker request
            options = {query: oRequest};
            // Ask the broker (synchronously)
            retval = private_methods.askBroker(options);
            // Evaluate the response
            // Check the return status
            if (retval.hasOwnProperty("status") && retval.status.toLowerCase() ==="ok") {
              // Retrieve the list of documents
              if (retval.hasOwnProperty("data") 
                      && retval.data.hasOwnProperty("mtas")) {
                data = retval.data;
                if (data.hasOwnProperty("stats")) {
                  oStats = data.stats;
                  // For comparison: get the number of hits provided by the global stats
                  iMainHits = oStats['total'];    
                  
                  // Get the MTAS-GROUP information: the overall MFW list
                  if (data.hasOwnProperty("mtas") && 
                      data.mtas.hasOwnProperty("group") && 
                      data.mtas.group.length > 0 &&
                      data.mtas.group[0].hasOwnProperty("list")) {
                    // Get the list of MFW objects
                    lHits = data.mtas.group[0].list;
                    // Walk this list
                    for (i=0;i<lHits.length;i++) {
                      // Retrieve this object
                      oTerm = lHits[i];
                      // Get the document ('n') and hit ('sum') frequencies
                      iDocs = oTerm['n'];
                      iFreq = oTerm['sum'];
                      // sWord = oTerm['key']; // Dit is niet helemaal correct
                      // De 'key' is bijvoorbeeld: "| [t_lc=\"de\"] |"
                      // Om het woord te halen: oTerm.group['hit'][0][0]['value']
                      // Maar dat hangt ervan af...
                      sWord = oTerm.group['hit'][0][0]['value'];
                      lMfw.push({freq: iFreq, docs: iDocs, lemma: sWord});
                      lMfwList.push(sWord);
                    }
                    // Add the MFW info
                    oBack['mfw'] = lMfw;
                    oBack['mfwlist'] = lMfwList;
                  }
                  
                }
              }
            } else if (retval.hasOwnProperty("status") && retval.status.toLowerCase() ==="error") {
              // Show the errors
              private_methods.showMessage(
                "Fout in [getGroupResults]: askBroker returns errors." +
                "<table>"+
                "<tr><td>status:</td><td>"+retval.data.status+"</td></tr>" +
                "<tr><td>text:</td><td>"+retval.data.text+"</td></tr>" +
                "<tr><td>error:</td><td>"+retval.data.error+"</td></tr>" +
                "</table>"
              );
            }
            // Return what we found
            return oBack;
          } catch (err) {
            private_methods.showMessage("Fout in [getMfwResultsG]: " + err.message);
            return oBack;
          }
        },
                
        /**
         * getPcaResultsObject
         *    Convert the existing PCA table into an object that contains all the 
         *    relevant information for downloading as CSV
         * 
         * @param {type} sOutType
         * @returns {unresolved}
         */
        getPcaResultsObject : function(sOutType) {
          var oResult = {},   // Resulting object for easy processing in "R"
              i, j;           // Counter
              
          try {
            // Validate
            if (sOutType === undefined) return false;
            
            // Action depends on outtype
            switch (sOutType) {
              case "stylo-pca": // Retrieve the principle component analysis
                // Create the resulting object
                oResult = {"nrows": loc_oPcaTable['rownames'].length, 
                           "ncols": loc_oPcaTable['colnames'].length,
                           "rowheaders": loc_oPcaTable['rownames'], 
                           "columnheaders": loc_oPcaTable['colnames'],
                           "table": loc_oPcaTable['table']};
                break;
            }            
            
            return oResult;
          } catch (err) {
            private_methods.showMessage("Fout in [getPcaResultsObject]: " + err.message);
            return null;
          }
        },
        /**
         * getOutputResultsObject
         *    Convert the (existing) frequency table into an object that
         *      contains all the relevant information of the freq table for
         *      easy processing in "R"
         * 
         * @param {string} sOutType - options: 'alldocs', ...
         * @returns {list}
         */
        getOutputResultsObject : function(sOutType) {
          var lResults = [],  // List with the requested results
              oResult = {},   // Resulting object for easy processing in "R"
              lRowHdr = [],   // Row headers (words)
              lColHdr = [],   // COlumn headers (author + text name)
              lTable = [],    // The table as one list: row-by-row
              lOrdered = [],  // Ordered list of results
              lTotal = [],    // Total number of words per document
              lFreq = [],     // List of frequencies per document
              sTitle = "",    // Adapted title
              oTemp = {},     // Temporary result
              i, j,           // Counter
              iMfw = 0;       // Total number of mfw's
              
          try {
            // Validate
            if (sOutType === undefined) return false;
            if (loc_lResultMfw.length ===0 || loc_lResultFreq.length ===0 ) {
              // Nothing to show
              private_methods.showMessage("Sorry, cannot create frequency table");
              return false;
            }
            // Get total number of most-frequent-words
            iMfw = loc_lResultMfw.length;
            
            // Action depends on outtype
            switch (sOutType) {
              case "alldocs": // Just give all the output in CSV form
                // Get the column headers: document names
                for (i=0;i<loc_iDocTotal;i++) {
                  // Get the prepared author+textname combination
                  lColHdr.push(loc_lResultFreq[i]['abbr']);
                  // Also get the total of this document and the list of frequencies
                  lTotal.push(loc_lResultFreq[i]['total']);
                  lFreq.push(loc_lResultFreq[i]['list']);
                }
                // Iterate through the frequency results
                for (i=0;i<iMfw; i++) {
                  // Get the row-header: the word for which frequencies have been determined
                  lRowHdr.push(loc_lResultMfw[i]['lemma']);
                  // Calculate and add the correct frequencies for each document
                  for (j=0;j<loc_iDocTotal;j++) {
                    lTable.push(lFreq[j][i]['freq'] * 100 / lTotal[j]);
                  }
                }
                // Create the resulting object
                oResult = {"nrows": iMfw, "ncols": loc_iDocTotal,
                           "rowheaders": lRowHdr, "columnheaders": lColHdr,
                           "table": lTable};
                break;

            }
            
            // Return the OBJECT (new method)
            // OLD: return lResults;
            return oResult;
          } catch (err) {
            private_methods.showMessage("Fout in [getOutputResultsObject]: " + err.message);
            return null;
          }
        },
        /**
         * getParameters
         *    Gather all the <form> parameters into an object
         * 
         * @returns {dictionary}
         */
        getParameters : function() {
          var oBack = {},   // Dict to be returned
              i,            // Counter
              field = "",
              fields = null;
              
          try {
            // Get all the fields to be taken into account
            fields = $("#stylometry-search").serializeArray();
            for (i=0;i<fields.length;i++) {
              field = fields[i];
              oBack[field.name] = field.value;
            }
            // Return what we have
            return oBack;
          } catch (err) {
            private_methods.showMessage("Fout in [getParameters]: " + err.message);
            // Signal error
            return oBack;
          }
        },
        /**
         * getStringParam - get a string parameter from the qdict
         *  
         * @param {type} qdict
         * @param {type} sParamName
         * @returns {String}
         */
        getStringParam: function(qdict, sParamName) {
          var sBack = "";
          try {
            // Validate
            if (qdict === undefined || qdict === null) return "";
            if (sParamName === undefined || sParamName === "") return "";
            if (qdict.hasOwnProperty(sParamName)) {
              sBack = qdict[sParamName].toString().trim();
            }
            return sBack;
          } catch (err) {
            private_methods.showMessage("Fout in [getStringParam]: " + err.message);
            return "";
          }
        },
        /**
         * 
         * @param {type} sSortType
         * @param {type} sSortDir
         * @returns {list}
         */
        getSortParameter : function(sSortType, sSortDir) {
          var lBack = [],   // List of sorting
              oSort = {};
          
          try {
            // Sorting: start out with default
            oSort = {field: "NLTitle_yearOfPublicationMin", direction: "asc"};
            // Any adaptations?
            if (sSortType !== "") {
              switch (sSortType) {
                case "word":
                  oSort = { "field": "NLPerson_NLPersonName_preferredLastName",
                            "direction": sSortDir};
                  break;
                case "freq":
                  oSort = { "field": "NLPerson_NLPersonName_preferredLastName",
                            "direction": sSortDir};
                  break;
                case "author":
                  oSort = { "field": "NLPerson_NLPersonName_preferredLastName",
                            "direction": sSortDir};
                  break;
                case "title":
                  oSort = { "field": "NLTitle_title",
                            "direction": sSortDir};
                  break;
                case "year":
                  oSort = { "field": "NLTitle_yearOfPublicationMin",
                            "direction": sSortDir};
                  break;
              }
            }
            // Return the result
            return oSort;
          } catch (err) {
            private_methods.showMessage("Fout in [getSortParameter]: " + err.message);
            return lBack;
          }
        },
        /**
         * getStatInfo
         *    Find out how many documents are selected by the query
         * 
         * @param {object} qdict
         * @returns {Boolean}
         */
        getStatInfo : function(qdict) {
          var oQuery = {},    // Broker query to be made
            oCondition = {},  // Condition part of the brokerquery
            oFilter = {},     // Filter part of the brokerquery
            oResponse = {},   // Response part of the query
            oResults = {};    // List of results

          try {
            // Get the "condition", "filter" and "sort" parts of the broker query - if these exist
            oCondition = private_methods.getFieldParam(qdict, "brokerquery", "condition");
            oFilter = private_methods.getFieldParam(qdict, "brokerquery", "filter");
            
            // All situations: add the stats request
            oResponse["stats"] = true;

            // Put it all together
            if (!$.isEmptyObject(oCondition)) oQuery["condition"] = oCondition;
            if (!$.isEmptyObject(oFilter))    oQuery["filter"]    = oFilter;
            oQuery["response"] = oResponse; // Add the response part we created
            oQuery["cache"] = true;         // NOTE: is adding "cache" a good thing or not??
            
            // Send the COMBINED query to the broker and get a list of results
            oResults = private_methods.getStatResults(oQuery);

            // Retrieve the statistics
            if (oResults.hasOwnProperty("total")) {
              loc_iDocTotal = oResults['total'];
            } else {
              // There are no results
              loc_iDocTotal = 0;
            }
            
            // Return positively
            return true;
          } catch (err) {
            private_methods.showMessage("Fout in [getStatInfo]: " + err.message);
            return false;
          }
        },
        /**
         * getStatResults
         *    Request statistical results from the broker
         * 
         * @param {type} oRequest
         * @returns {object}
         */
        getStatResults : function(oRequest) {
          var options,      // Object that is actually sent to the broker
            retval,         // Object returned by the broker
            oData = {},     // The data part of the response
            oBack = {};     // Object we return

          try {
            // Validate the REQUEST
            if (oRequest === undefined || $.isEmptyObject(oRequest)) return oBack;
            if (!oRequest.hasOwnProperty('response') ||
                !oRequest.response.hasOwnProperty('stats') ) return oBack;
        
            // Formulate broker request
            options = {query: oRequest};
            // Ask the broker (synchronously)
            retval = private_methods.askBroker(options);
            
            // Evaluate the RESPONSE
            // Check the return status
            if (retval.hasOwnProperty("status") && retval.status.toLowerCase() ==="ok") {
              // Get the data part
              oData = retval.data;
              // Get to the list of document information
              if (oData.hasOwnProperty("stats") && oData.stats.hasOwnProperty("total")) {
                oBack['total'] = oData.stats['total'];
              }
            }
            // Return what we have
            return oBack;
          } catch (err) {
            private_methods.showMessage("Fout in [getStatResults]: " + err.message);
            return oBack;
          }
        },
        /**
         * getStringListParam - the qdict parameter is a list of strings
         *                      Return this list as a full string
         *  
         * @param {type} qdict
         * @param {type} sParamName
         * @returns {String}
         */
        getStringListParam: function(qdict, sParamName) {
          var sBack = "",   // The string we return
              i,            // Counter
              lParam = [];  // The input list
          try {
            // Validate
            if (qdict === undefined || qdict === null) return "";
            if (sParamName === undefined || sParamName === "") return "";
            if (qdict.hasOwnProperty(sParamName)) {
              lParam = qdict[sParamName];
              for (i=0;i<lParam.length;i++) {
                if (sBack !== "") {sBack = sBack + ", ";};
                sBack = sBack + lParam[i];
              }
            }
            return sBack;
          } catch (err) {
            private_methods.showMessage("Fout in [getStringListParam]: " + err.message);
            return "";
          }
        },
        /**
         * getSummary
         *    Create a laymen's summary of the stylometry search request
         *    The [options] object can contain the following elements:
         * 
         * @param {object} options
         * @returns {string}
         */
        getSummary : function(options) {
          var lHtml = [];       // List of the message we return
          
          try {
            if (options.hasOwnProperty("outputtype")) {
              switch(options['outputtype']) {
                case "freq":
                  lHtml.push("De frequenties van de meest frequente woorden zijn bepaald");
                  break;
              }
            }

            // Return the resulting list
            return lHtml.join(" ");
          } catch (err) {
            private_methods.showMessage("Fout in [getSummary]: " + err.message);
            return "";
          }
        },
        /**
         * getWordFreqInList - Get the frequency of [sWord] from the list [lMfwList]
         * @param {type} sWord
         * @param {type} lMfwList
         * @returns {undefined}
         */
        getWordFreqInList : function(sWord, lMfwList) {
          var i,  // Counter
              oFreq = {}; // One frequency object
          
          try {
            // Find the word in [lMfwList]
            for (i=0;i<lMfwList.length;i++) {
              oFreq = lMfwList[i];
              if (oFreq['key'] === sWord) {
                // Found it!
                return oFreq['sum'];
              }
            }
            // It's not in there: return zero
            return 0;
          } catch (err) {
            private_methods.showMessage("Fout in [getWordFreqInList]: " + err.message);
            return 0;
          }
        },
        /**
         * handleResultaatActies
         *    Afhandelen van button clicks in Collocations
         * 
         * @param {object} options
         * @returns {void}
         */
        handleResultaatacties : function(options) {
          try {
            // ============ LINKERPANEEL ============================
            // Button: 'reset'
            $("#stylometry-reset").click(function(e) {
              e.preventDefault();
              nederlab.stylometry.reset();
            });
            // Button: 'taak uitvoeren'
            $("#stylometry-submit").click(function(e) {
              e.preventDefault();
              nederlab.stylometry.selectTask();
            });
            // Button: 'bepalen' (van woordfrequenties)
            $("#stylo-dofreq").click(function(e) {
              e.preventDefault();
              nederlab.stylometry.selectTask("freq");
            });

            // ============ RESULTATEN ==============================
            // Button: 'zoekvraag'
            $("#stylometry-corpus-query-show").click(function(e) {
              e.preventDefault();
              nederlab.stylometry.toggleShowRequest();
            });
            // Button: 'nstylo'
            $("#stylometry-nstylo-msg-show").click(function(e) {
              e.preventDefault();
              nederlab.stylometry.toggleShowNstylo();
            });
            
            // ============ RESULTATEN FREQ =========================
            // Button: 'download csv'
            $("#stylometry-download-freq").click(function(e) {
              e.preventDefault();
              nederlab.stylometry.export('freq-csv');
            });
            $("#stylometry-download-pca").click(function(e) {
              e.preventDefault();
              nederlab.stylometry.export('pca-csv');
            });
            // Button: 'download svg'
            $("#stylometry-svg").click(function(e) {
              e.preventDefault();
              nederlab.stylometry.export('pca-svg');
            });
            // Button to execute visualisation 'network'
            $("#stylometry-network").click(function(e) {
              e.preventDefault();
              private_methods.showVisualisation(1);
            });
            // Button to execute visualisation 'graph'
            $("#stylometry-graph").click(function(e) {
              e.preventDefault();
              private_methods.showVisualisation(2);
            });
            // Button to execute visualisation 'dendro'
            $("#stylometry-dendro").click(function(e) {
              e.preventDefault();
              private_methods.showVisualisation(3);
            });
            // Return positively
            return true;
          } catch (err) {
            private_methods.showMessage("Fout in [handleResultaatacties]: " + err.message);
            return false;
          }
        },
        hideAllOutput : function() {
          var i = 0;
          
          try {
            // Hide the output with names output-level-N
            for (i=1;i<=2;i++) {
              $("#output-level-"+i.toString()).addClass("hidden");
            }
            // Hide the visualization output
            $("#stylo-visualisatie").addClass("hidden");
          } catch (err) {
            private_methods.showMessage("Fout in [hideAllOutput]: " + err.message);
          }
        },
        hideHelp : function() {
          $("#stylometry-help-intro").addClass("hidden");
        },
        hideHitNumber : function() {
          $("#numberofhits").addClass("hidden");
          $("#outputtyping").addClass("hidden");
          $("#resultOrganizer-1").addClass("hidden");
          $("#resultOrganizer").addClass("hidden");
          $("#stylometry-result-info").addClass("hidden");
          $("#stylometry-vis-choices").addClass("hidden");
        },
        hideStyloSummary: function() {
          $("#stylometry-summary").addClass("hidden");            
        },
        replaceLtGt : function(sIn) {
          if (sIn === undefined) return "";
          return sIn.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        },
        retrieveData : function(options) {
          var retval = {},
              async = true,
              session_id = options.userinfo.session_id,
              requesttime = new Date().getTime(),
              ajaxoptions,
              maxnumberoftrials = 10, 
              mainjqxhr;
      
          try {
            // Validate
            if (options === undefined) {return false;}
            // Take over some parameters
            if (options.hasOwnProperty('async')) {async = options.async;}
            // How are we to proceed?
            if (async) {
              // Perform asynchronously -- after 1 millisecond
              setTimeout(function() {
                options.callbackfunction(options.data, options.type);
              }, 1);
            } else {
              // Perform synchronously
              options.callbackfunction(options.data, options.type);
            }
            
            // Return positively
            return true;
          } catch (ex) {
            return false;
          }
        },
        /**
         * searchExcludeWords
         *    Look at the search specification and try to get a list
         *    of words that need to be excluded on the basis of
         *    their lemma and/or pos
         * 
         * @param {type} qdict
         * @returns {Array}
         */
        searchExcludeWords: function(qdict) {
          var oBack = {},     // Object with exclusion information
              lBack = [],     // List of words to be excluded
              i,j,
              oCondition = {},
              oFilter = {},
              oResponse = {},
              oSort = {},
              oQuery = {},
              oGroupMtas = {},
              oResults = {},
              sParam = "",
              sQuery = "",
              lExcl = [],
              lTmp = [],
              lCql = [],
              iMfw = 0;
          
          try {
            // Get the "condition", "filter" and "sort" parts of the broker query - if these exist
            oCondition = private_methods.getFieldParam(qdict, "brokerquery", "condition");
            oFilter = private_methods.getFieldParam(qdict, "brokerquery", "filter");
            
            // Initialize the back object
            oBack['word'] = [];   // individual words to be excluded
            oBack['lemma'] = [];  // lemma's to be excluded
            oBack['pos'] = [];    // pos-tags to be excluded
            oBack['excl'] = [];   // overall words satisfying the exclusion criteria
            
            // Check if the MFW number should be changed
            iMfw = private_methods.getIntParam(qdict, "stylo-mfwnum", iMfw);
            
            // Preparations that always go
            oResponse["stats"] = true;
            if (!$.isEmptyObject(oCondition)) oQuery["condition"] = oCondition;
            if (!$.isEmptyObject(oFilter))    oQuery["filter"]    = oFilter;
            if (!$.isEmptyObject(oSort))      oQuery["sort"]      = oSort;
            oQuery["response"] = oResponse; // Add the response part we created
            oQuery["cache"] = true;         // NOTE: is adding "cache" a good thing or not??
           
            // Check if certain words need to be excluded
            sParam = private_methods.getStringParam(qdict, "stylo-mfw-exclude-words", "");
            if (sParam !== "") {
              lExcl = sParam.split(/,\s*/);
              for (j=0;j<lExcl.length;j++) {
                // Add this word to the words that need to be excluded
                lBack.push(lExcl[j]);
                oBack['word'].push(lExcl[j]);
              }
            }
            // Check if certain lemma's need to be excluded
            sParam = private_methods.getStringParam(qdict, "stylo-mfw-exclude-lemmas", "");
            if (sParam !== "") {
              // Get a list of words in the documents that have this lemma
              lTmp = [];
              lExcl = sParam.split(/,\s*/);
              for (j=0;j<lExcl.length;j++) {
                lTmp.push("lemma=\""+lExcl[j]+"\"");
                oBack['lemma'].push(lExcl[j]);
              }
              // Create the CQL to find the words we need
              sQuery = "[" + lTmp.join(" | ") + "]";
              // Create the broker mtas.group part to get the occurrances in the texts
              oGroupMtas = [{field: "NLContent_mtas",key: "list of words with POS tag",
                    query: {"type": "cql", "value": sQuery},
                    grouping: {"hit": { "inside": "t_lc"}},
                    sort: { type: "sum"},number: iMfw
              }];
              // Combine the query
              oResponse['mtas'] = {group: oGroupMtas};
              oQuery['response'] = JSON.parse(JSON.stringify(oResponse));
              // Send group query and get results
              oResults = private_methods.getMfwResultsG(oQuery);
              // Check and copy what has been returned
              if (oResults !== null && 'mfwlist' in oResults) {
                for (i=0;i<oResults['mfwlist'].length;i++) {
                  lBack.push(oResults['mfwlist'][i]);
                }
              }
            }
            // Check if certain POS-tags need to be excluded
            sParam = private_methods.getStringParam(qdict, "stylo-mfw-exclude-postags", "");
            if (sParam !== "") {
              // Get a list of words in the document that have these POS tags
              lExcl = sParam.split(/,\s*/);
              lTmp = [];
              for (j=0;j<lExcl.length;j++) {
                lTmp.push("pos=\""+lExcl[j]+"\"");
                oBack['pos'].push(lExcl[j]);
              }
              // Create the CQL to find the words we need
              sQuery = "[" + lTmp.join(" | ") + "]";
              // Create the broker mtas.group part to get the occurrances in the texts
              oGroupMtas = [{field: "NLContent_mtas",key: "list of words with POS tag",
                    query: {"type": "cql", "value": sQuery},
                    grouping: {"hit": { "inside": "t_lc"}},
                    sort: { type: "sum"},number: iMfw
              }];
              // Combine the query
              oResponse['mtas'] = {group: oGroupMtas};
              oQuery['response'] = JSON.parse(JSON.stringify(oResponse));
              // Send group query and get results
              oResults = private_methods.getMfwResultsG(oQuery);
              // Check and copy what has been returned
              if (oResults !== null && 'mfwlist' in oResults) {
                for (i=0;i<oResults['mfwlist'].length;i++) {
                  lBack.push(oResults['mfwlist'][i]);
                }
              }
            }
            oBack['excl'] = lBack;
           
            
            // Return positively
            return oBack;
          } catch (err) {
            private_methods.showMessage("Fout in [searchExcludeWords]: " + err.message);
            return {};
          }
        },
        /**
         * searchStyloF
         *    (Version 'f': use the mtas.termvector command)
         *    Two tasks:
         *    (1) Get the overal MFW list (most-frequent-words) for all docs 
         *    (2) Step-by-step get information per document:
         *        a. title/author info
         *        b. number of words per document
         *        c. frequency of all words in (1) per document
         * 
         * @param {object} qdict
         * @returns {bool}
         */
        searchStyloF: function(qdict) {
          var iMfw = 100,     // Number of most-frequent-words to be used
            iDocs = 0,        // Total number of documents to be processed
            iDocStep = 10,    // Number of documents to be treated on every step
            iDoc = 0,         // Document counter
            j=0,              // Counter
            lMfwList = [],    // MFW list (ovarall - words)
            oStats = {},      // MTAS stats condition
            oQuery = {},      // Broker query to be made
            oDocs = {},       // The 'documents' part of the response
            oDocMtas = {},    // MTAS document part
            oTermMtas = {},   // MTAS termvector
            oCondition = {},  // Condition part of the brokerquery
            oFilter = {},     // Filter part of the brokerquery
            oSort = {},       // Sort part of the brokerquery
            oResponse = {},   // Response part of the query
            lExcl = [],       // List of words to be excluded
            sExcl = "",       // Regular expression fo words that need to be excluded
            sParam = "",      // General purpose parameter
            sMethod = "",     // sampling method
            iSize = 0,        // sampling size
            oResults = {};    // List of results

          try {
            // Get any parameters from the dictionary [qdict]
            
            // Determine exactly how many documents are involved in this query
            iDocs = loc_iDocTotal;
            
            // Get the "condition", "filter" and "sort" parts of the broker query - if these exist
            oCondition = private_methods.getFieldParam(qdict, "brokerquery", "condition");
            oFilter = private_methods.getFieldParam(qdict, "brokerquery", "filter");
            
            // Determine the samplign method and size
            sMethod = private_methods.getStringParam(loc_qParams, "stylo-sampling-method", "no");
            iSize = private_methods.getIntParam(loc_qParams, "stylo-samplesize", 10000);
           
            // Check if the MFW number should be changed
            iMfw = private_methods.getIntParam(qdict, "stylo-mfwnum", iMfw);
            // Check if certain words need to be excluded
            sParam = private_methods.getStringParam(qdict, "stylo-mfw-exclude-words", "");
            if (sParam !== "") {
              lExcl = sParam.split(/,\s*/);
              sExcl = "(?!" + lExcl.join("|") + ")";
            }
            
            // Step (1): Use the MTAS termvector to get an overal MFW list
            oTermMtas = [{field: "NLContent_mtas",key: "list of words",
                  prefix: "t_lc",regexp: sExcl+"([a-z].*)",type: "n,sum",
                  sort: { type: "sum"},number: iMfw
            }];
          
            // Step (1): combine
            oResponse["mtas"] = {termvector: oTermMtas};
            oResponse["stats"] = true;
            if (!$.isEmptyObject(oCondition)) oQuery["condition"] = oCondition;
            if (!$.isEmptyObject(oFilter))    oQuery["filter"]    = oFilter;
            if (!$.isEmptyObject(oSort))      oQuery["sort"]      = oSort;
            oQuery["response"] = oResponse; // Add the response part we created
            oQuery["cache"] = true;         // NOTE: is adding "cache" a good thing or not??
            
            // ============ DEBUGGING ==============
            // Provide the query and the CQL -- these are shown on request of the user
            private_methods.showBrokerQuery(oQuery);
            // =====================================
            
            // Store the query for use on the same search question
            loc_oQuery = oQuery;
            
            // Step (1): Send the query to the broker and get a list of results
            oResults = private_methods.getMfwResults(oQuery);
            
            // Store the results locally
            loc_lResultMfw = JSON.parse(JSON.stringify(oResults['mfw']));
            lMfwList  = JSON.parse(JSON.stringify(oResults['mfwlist']));

            // Step (2): Preparations...
            // Step (2a): Use 'documents' to get title/author info
            oDocs = {number: iDocStep, start: 0,
              fields: ["NLCore_NLIdentification_nederlabID",
                "NLProfile_name","NLTitle_title",
                "NLContent_mtas_numberOfPositions",
                {
                  "name": "authorinfo",
                  "join": {
                    "from": "NLTitle_NLPersonRef_personID",
                    "to": "NLCore_NLIdentification_nederlabID"
                  },
                  "fields": [
                    "NLCore_NLIdentification_nederlabID",
                    "NLPerson_NLPersonName_preferredFullName",
                    "NLPerson_NLPersonName_preferredLastName",
                    "NLPerson_NLPersonName_preferredFirstName",
                    "NLPerson_gender"
                  ]
                }
              ]
            };
            
            // Step (2b): Use MTAS stats to get the number of words per doc
            oStats = {
              tokens: [{ field: "NLContent_mtas", key: "words", type: "n, sum" }]
            };

            // Step (2c): Define the MTAS document part
            oDocMtas = [{field: "NLContent_mtas",
                  key: "advanced list of words",prefix: "t_lc",
                  regexp: lMfwList,type: "n,sum",listRegexp: false,
                  number: iMfw
                  // NOTE: the 'number' here is the number of words
            }];

            // Step (2): Prepare the general part of the 'response'
            oResponse["mtas"] = {document: oDocMtas, stats: oStats};
            
            // Step (2): Loop through all documents
            // Assumptions: 
            // - oQuery already contains valid parts: condition, filter, sort, cache
            // - oResponse 
            for (iDoc=0;iDoc<iDocs;iDoc += iDocStep) {
              // Show what we are doing
              if (iDocStep === 1) {
                private_methods.showMessage("Bereken woordfrequenties in document "+(iDoc+1)+" van de "+iDocs);
              } else {
                private_methods.showMessage("Bereken woordfrequenties in documenten "+(iDoc+1)+"-"+Math.min(iDoc+iDocStep, iDocs)+" van de "+iDocs);
              }
              // Set the parameters for this item
              oDocs['start'] = iDoc;
              // Adapt the Response object
              oResponse['documents'] = oDocs;
              // Put the adapted 'response' part in the query
              oQuery["response"] = oResponse; // Add the response part we created
              
              if (iDoc===0) {
                // ============ DEBUGGING ==============
                // Only show the query that fetches the first [iDocStep] documents...
                private_methods.showBrokerQuery(oQuery);
                // =====================================
              }
              
              // Send the COMBINED query to the broker and get a list of results
              // NOTE: this gets the results for [iDocStep] number of documents
              oResults = private_methods.getMfwPerDoc(oQuery, lMfwList);
              
              // Check if the results are licit
              if (oResults !== undefined && oResults !== null && 'doc' in oResults) {
                // Store the results for this document
                for (j=0;j<oResults['doc'].length;j++) {
                  loc_lResultFreq.push(oResults['doc'][j]);
                }
              } else {
                // Could not get the results for this series
                private_methods.showMessage("Fout in [searchStyloF]: could not get the results for document " + iDoc);
              }
                            
            }
            
            // Return positively
            return true;
          } catch (err) {
            private_methods.showMessage("Fout in [searchStyloF]: " + err.message);
            return false;
          }
        },
        /**
         * searchStyloG
         *    (Version 'g': use the mtas.group command)
         *    Two tasks:
         *    (1) Get the overal MFW list (most-frequent-words) for all docs 
         *        Make use of the mtas.group command to do this
         *    (2) Step-by-step get information per document:
         *        a. title/author info
         *        b. number of words per document
         *        c. frequency of all words in (1) per document
         * 
         * @param {object} qdict
         * @returns {bool}
         */
        searchStyloG: function(qdict) {
          var iMfw = 100,     // Number of most-frequent-words to be used
            iDocs = 0,        // Total number of documents to be processed
            iDocStep = 10,    // Number of documents to be treated on every step
            iDoc = 0,         // Document counter
            j=0,              // Counter
            lMfwList = [],    // MFW list (ovarall - words)
            oStats = {},      // MTAS stats condition
            oQuery = {},      // Broker query to be made
            oDocs = {},       // The 'documents' part of the response
            oDocMtas = {},    // MTAS document part
            oTermMtas = {},   // MTAS termvector
            oGroupMtas = {},  // MTAS group command
            oCondition = {},  // Condition part of the brokerquery
            oFilter = {},     // Filter part of the brokerquery
            oSort = {},       // Sort part of the brokerquery
            oResponse = {},   // Response part of the query
            lExcl = [],       // List of words to be excluded
            oExcl = {},       // Exclusion object
            lCql = [],        // List of CQL query parts
            lTmp = [],        // Temporary list
            sExcl = "",       // Regular expression fo words that need to be excluded
            sMethod = "",     // sampling method
            iSize = 0,        // sampling size
            oResults = {};    // List of results

          try {
            // Get any parameters from the dictionary [qdict]
            
            // Determine exactly how many documents are involved in this query
            iDocs = loc_iDocTotal;
            
            // Get the "condition", "filter" and "sort" parts of the broker query - if these exist
            oCondition = private_methods.getFieldParam(qdict, "brokerquery", "condition");
            oFilter = private_methods.getFieldParam(qdict, "brokerquery", "filter");
            
            // Check if the MFW number should be changed
            iMfw = private_methods.getIntParam(qdict, "stylo-mfwnum", iMfw);
            
            // Determine the samplign method and size
            sMethod = private_methods.getStringParam(loc_qParams, "stylo-sampling-method", "no");
            iSize = private_methods.getIntParam(loc_qParams, "stylo-samplesize", 10000);

            // Get a list of words that need to be excluded
            private_methods.showMessage("Een lijst maken met uit te sluiten woorden...");
            oExcl = private_methods.searchExcludeWords(qdict);
            lExcl = oExcl['excl'];
            loc_oExclude = JSON.parse(JSON.stringify(oExcl));
            
            // Step (1): Use the MTAS termvector to get an overal MFW list
            oTermMtas = [{field: "NLContent_mtas",key: "list of words",
                  prefix: "t_lc",regexp: "([a-z].*)", ignoreList: lExcl,type: "n,sum",
                  sort: { type: "sum"},number: iMfw
            }];
          
            // Step (1): combine
            oResponse["mtas"] = {termvector: oTermMtas};
            oResponse["stats"] = true;
            if (!$.isEmptyObject(oCondition)) oQuery["condition"] = oCondition;
            if (!$.isEmptyObject(oFilter))    oQuery["filter"]    = oFilter;
            if (!$.isEmptyObject(oSort))      oQuery["sort"]      = oSort;
            oQuery["response"] = oResponse; // Add the response part we created
            oQuery["cache"] = true;         // NOTE: is adding "cache" a good thing or not??
            
            // ============ DEBUGGING ==============
            // Provide the query and the CQL -- these are shown on request of the user
            private_methods.showBrokerQuery(oQuery);
            // =====================================
            
            // Store the query for use on the same search question
            loc_oQuery = oQuery;
            
            // Step (1): Send the query to the broker and get a list of results
            // NOTE: use the "G" version to process the group results
            private_methods.showMessage("Zoeken naar de MFW lijst voor alle documenten...");
            oResults = private_methods.getMfwResults(oQuery);
            
            // Store the results locally
            loc_lResultMfw = JSON.parse(JSON.stringify(oResults['mfw']));
            lMfwList  = JSON.parse(JSON.stringify(oResults['mfwlist']));

            // Step (2): Preparations...
            // Step (2a): Use 'documents' to get title/author info
            oDocs = {number: iDocStep, start: 0,
              fields: ["NLCore_NLIdentification_nederlabID",
                "NLProfile_name","NLTitle_title",
                "NLContent_mtas_numberOfPositions",
                {
                  "name": "authorinfo",
                  "join": {
                    "from": "NLTitle_NLPersonRef_personID",
                    "to": "NLCore_NLIdentification_nederlabID"
                  },
                  "fields": [
                    "NLCore_NLIdentification_nederlabID",
                    "NLPerson_NLPersonName_preferredFullName",
                    "NLPerson_NLPersonName_preferredLastName",
                    "NLPerson_NLPersonName_preferredFirstName",
                    "NLPerson_gender"
                  ]
                }
              ]
            };
            
            // Step (2b): Use MTAS stats to get the number of words per doc
            oStats = {
              tokens: [{ field: "NLContent_mtas", key: "words", type: "n, sum" }]
            };

            // Step (2c): Define the MTAS document part
            oDocMtas = [{field: "NLContent_mtas",
                  key: "advanced list of words",prefix: "t_lc",
                  regexp: lMfwList,type: "n,sum",listRegexp: false,
                  number: iMfw
                  // NOTE: the 'number' here is the number of words
            }];

            // Step (2): Prepare the general part of the 'response'
            oResponse["mtas"] = {document: oDocMtas, stats: oStats};
            
            // Step (2): Loop through all documents
            // Assumptions: 
            // - oQuery already contains valid parts: condition, filter, sort, cache
            // - oResponse 
            for (iDoc=0;iDoc<iDocs;iDoc += iDocStep) {
              // Show what we are doing
              if (iDocStep === 1) {
                private_methods.showMessage("Bereken woordfrequenties in document "+(iDoc+1)+" van de "+iDocs);
              } else {
                private_methods.showMessage("Bereken woordfrequenties in documenten "+(iDoc+1)+"-"+Math.min(iDoc+iDocStep, iDocs)+" van de "+iDocs);
              }
              // Set the parameters for this item
              oDocs['start'] = iDoc;
              // Adapt the Response object
              oResponse['documents'] = oDocs;
              // Put the adapted 'response' part in the query
              oQuery["response"] = oResponse; // Add the response part we created
              
              if (iDoc===0) {
                // ============ DEBUGGING ==============
                // Only show the query that fetches the first [iDocStep] documents...
                private_methods.showBrokerQuery(oQuery);
                // =====================================
              }
              
              // Send the COMBINED query to the broker and get a list of results
              // NOTE: this gets the results for [iDocStep] number of documents
              oResults = private_methods.getMfwPerDoc(oQuery, lMfwList);
              
              // Check if the results are licit
              if (oResults !== undefined && oResults !== null && 'doc' in oResults) {
                // Store the results for this document
                for (j=0;j<oResults['doc'].length;j++) {
                  loc_lResultFreq.push(oResults['doc'][j]);
                }
              } else {
                // Could not get the results for this series
                private_methods.showMessage("Fout in [searchStyloG]: could not get the results for document " + iDoc);
              }
                            
            }
            
            // Return positively
            return true;
          } catch (err) {
            private_methods.showMessage("Fout in [searchStyloG]: " + err.message);
            return false;
          }
        },
        /**
         * searchTexts
         *    Find information on all the documents in the corpus
         *    by using the information in qdict:
         * 
         * @param {object} qdict
         * @param {int}    iStart     zero-based list-index of first item to be shown
         * @param {object} options    other search options
         * @returns {bool}
         */
        searchTexts: function(qdict, iStart, options) {
          var iMfw = 100,     // Number of most-frequent-words to be used
            oStats = {},      // MTAS stats condition
            oQuery = {},      // Broker query to be made
            oDocs = {},       // The 'documents' part of the response
            oDocMtas = {},    // MTAS document part
            oTermMtas = {},   // MTAS termvector
            oCondition = {},  // Condition part of the brokerquery
            oFilter = {},     // Filter part of the brokerquery
            oSort = {},       // Sort part of the brokerquery
            oResponse = {},   // Response part of the query
            iPageSize = 0,    // Number of results per page
            sSortType = "",   // Type of sorting (optional)
            sSortDir = "",    // Direction of sorting (asc, desc) - optional
            oResults = {};    // List of results

          try {
            // Get any parameters from the dictionary [qdict]
            
            // TODO: Determine exactly how many documents are involved in this query
            
            // Get the "condition", "filter" and "sort" parts of the broker query - if these exist
            oCondition = private_methods.getFieldParam(qdict, "brokerquery", "condition");
            oFilter = private_methods.getFieldParam(qdict, "brokerquery", "filter");

            // Evaluate options
            iPageSize = loc_iPageSize;
            if (options !== undefined) {
              if ('pagesize' in options) {iPageSize = options['pagesize']; }
              if ('sorttype' in options) { sSortType = options['sorttype']; }
              if ('sortdir' in options) { sSortDir = options['sortdir']; }
            }
            
            // Get the sorting
            oSort = private_methods.getSortParameter(sSortType, sSortDir);
            
            // Convert start to document number
            // iStart = iStart * loc_iPageSize;
            // We need to have a 'documents' part in the response
            oDocs = {number: iPageSize, start: iStart,
              fields: ["NLCore_NLIdentification_nederlabID",
                "NLProfile_name","NLTitle_title", "NLTitle_edition",
                "NLTitle_subtitle", "NLTitle_genre",
                "NLTitle_yearOfPublicationMin", "NLTitle_yearOfPublicationLabel",
                "NLTitle_NLPersonRef_personID",
                { "name": "authorinfo",
                  "join": { "from": "NLTitle_NLPersonRef_personID",
                            "to": "NLCore_NLIdentification_nederlabID" },
                  "fields": [
                    "NLCore_NLIdentification_nederlabID",
                    "NLPerson_NLPersonName_preferredFullName",
                    "NLPerson_NLPersonName_preferredLastName",
                    "NLPerson_NLPersonName_preferredFirstName",
                    "NLPerson_yearOfBirthMin", "NLPerson_yearOfBirthLabel",
                    "NLPerson_placeOfBirth",
                    "NLPerson_yearOfDeathMin", "NLPerson_yearOfDeathLabel",
                    "NLPerson_placeOfDeath",
                    "NLPerson_gender"
                  ]
                }
              ]
            };
            
            // The response first of all contains a documents section
            oResponse['documents'] = oDocs;
            
            // All situations: add the stats request
            oResponse["stats"] = true;

            // Put it all together
            if (!$.isEmptyObject(oCondition)) oQuery["condition"] = oCondition;
            if (!$.isEmptyObject(oFilter))    oQuery["filter"]    = oFilter;
            if (!$.isEmptyObject(oSort))      oQuery["sort"]      = [ oSort ];
            oQuery["response"] = oResponse; // Add the response part we created
            oQuery["cache"] = true;         // NOTE: is adding "cache" a good thing or not??
            
            // ============ DEBUGGING ==============
            // Provide the query and the CQL -- these are shown on request of the user
            private_methods.showBrokerQuery(oQuery);
            // =====================================
            
            // Store the query for use on the same search question
            loc_oQuery = oQuery;
            
            // Send the COMBINED query to the broker and get a list of results
            oResults = private_methods.getDocResults(oQuery);
            
            // Store the results locally
            loc_lDocInfo = oResults['info'];

            // Return positively
            return true;
          } catch (err) {
            private_methods.showMessage("Fout in [searchTexts]: " + err.message);
            return false;
          }
        },
        /**
         * setStyloParams
         *    Set the parameters, taking them from the formquery in [qdict]
         * 
         * @param {type} qdict
         * @returns {Boolean}
         */
        setStyloParams : function(qdict) {
          var sTerm = "";
          
          try {
            // Correct the zoekterm
            if (qdict.hasOwnProperty("stylo-zoekterm")) {
              sTerm = qdict['stylo-zoekterm'];
              private_methods.storeZoekterm(sTerm, false);
              private_methods.showZoekterm();
            }
            
            // Return positively
            return true;
          } catch (err) {
            private_methods.showMessage("Fout in [setStyloParams]: " + err.message);
            return false;
          }
        },
        showBrokerQuery : function(oQry) {
          // Set the QUERY for reference by the user
          $("#stylo-request").html(private_methods.replaceLtGt(JSON.stringify(oQry, null, 2)));
        },
        /**
         * showCorpusInfo
         *    Show the necessary corpus information
         * 
         * @returns {undefined}
         */
        showCorpusInfo : function() {
          var lHtml = [],
              data;
          
          // Reveal it
          $("#stylometry-corpus-info").removeClass("hidden");
          // Get the information that has been stored
          $("#stylometry-crp-details").html(loc_sZoekterm.replace(new RegExp("[\s]?,[\s]?", 'g'), "<br>"));
        },        
        showHelp : function(sPart) {
          var sDiv = "#stylometry-help-";
          
          // Validate
          if (sPart === undefined) return;
          $(sDiv + sPart).removeClass("hidden");
        },
        /**
         * showHitNumber
         *    Show the number of hits
         * 
         * @param {object} options
         * @returns {void}
         */
        showHitNumber : function(options) {
          var sHtml = "";
          
          try {
            // Validate
            if (loc_iDocTotal === undefined) {
              sHtml = "Totaal aantal documenten: geen";
            } else {
              // Start making the text
              sHtml = "Totaal aantal documenten: <b>"+
                      loc_iDocTotal.toString()+
                      " </b>"+
                      "Auteurs: <b>"+loc_lAuthorInfo.length+"</b>";
            }
            // Can we add freq/docs?
            /*
            if (sLemma !== undefined && iFreq !== undefined && iDocs !== undefined) {
              sHtml = "<div>" + sHtml + "</div>" +
                      "<div>Lemma <span class='coll-result-sel'>"+sLemma+"</span>: <b>" +iFreq +
                      "</b> in <b>" + iDocs + "</b> documenten</div>";                    
            }*/

            $("#numberofhits").removeClass("hidden");
            $("#numberofhits").html(sHtml);          
            $("#outputtyping").removeClass("hidden");
            $("#resultOrganizer-1").removeClass("hidden");
            $("#resultOrganizer").removeClass("hidden");
            $("#stylometry-result-info").removeClass("hidden");
            // Should we show the CSV export button?
            if (options !== undefined && options.hasOwnProperty("exportcsv")) {
              if (options['exportcsv']) {
                $("#stylometry-result-info .exportcsv").removeClass("hidden");
              } else {
                $("#stylometry-result-info .exportcsv").addClass("hidden");
              }
            }
          } catch (err) {
            private_methods.showMessage("Fout in [showHitNumber]: " + err.message);
          }
        },
        /**
         * showMessage
         *    Display a message to the user on a location in his view
         * 
         * @param {string} sMsg
         * @param {bool}   bAdd   OPTIONAL: 
         * @returns {undefined}
         */
        showMessage: function(sMsg, bAdd) {
          var sDiv = "#" + loc_msgDiv,
              sPre = "",
              sPost = "",
              sPrev;
          
          // Check if this is an error
          if (sMsg.indexOf("Fout")>=0) {
            sPre = "<code>"; sPost = "</code>";
          }
          // The message will appear on the fixed <div> with the name here
          if (bAdd === undefined || bAdd === false) {
            // OVerwrite: position this message
            $(sDiv).html(sPre+sMsg+sPost);        
          } else {
            // Get the previous message
            sPrev = $(sDiv).html();
            // Add the message to what is there already
            $(sDiv).html(sPre+sPrev + '\n<br>' + sMsg+sPost);        
          }
          // For the benefit of Chrome and IE: do a refresh
          $(sDiv).hide().show(0);
        },
        showNstyloMsg : function(sMsg, bAdd) {
          var sDiv = "#" + loc_msgNstylo,
              sPrev;
          
          // The message will appear on the fixed <div> with the name here
          if (bAdd === undefined || bAdd === false) {
            // OVerwrite: position this message
            $(sDiv).html(sMsg);        
          } else {
            // Get the previous message
            sPrev = $(sDiv).html();
            // Add the message to what is there already
            $(sDiv).html(sPrev + '\n<br>' + sMsg);        
          }
          // For the benefit of Chrome and IE: do a refresh
          $(sDiv).hide().show(0);
        },
        /**
         * showPaginationTextListview
         *    Create and show pagination buttons for the listview of texts
         * 
         * @param {int} iStart  - item number to be displayed (first)
         * @param {int} iCount    total number of items to be displayed
         * @returns {undefined}
         */
        showPaginationTextListview : function(iStart, iCount) {
          var i,          // Counter
              iNum,       // Page number
              iPageFirst, // First page to be shown in the list
              iPageLast,  // Last page for the list
              sEvent,     // Event
              lHtml = []; // Store html output
          
          try {
            // Calculate the number of pages
            loc_iPageNum = Math.ceil(iCount / loc_iPageSize);
            // Figure out which page we are in with [iStart]
            loc_iPageCurrent = Math.floor(iStart / loc_iPageSize);
            // Calculate the first and the last page
            iPageFirst = Math.max(1, loc_iPageCurrent - 4);
            iPageLast  = Math.min(loc_iPageNum, iPageFirst + 8);
            // Create the event
            sEvent = " onclick='nederlab.stylometry.doPage(this);'";
            // If the first page is larger than 1, then show previous and first page items
            if (iPageFirst > 1) {
                lHtml.push("<a class='paging-first' "+sEvent+" data-page='1'>&lt;&lt;</a>");
                lHtml.push("<a class='paging-prev' "+sEvent+" data-page='" + (iPageFirst-1) + "'>&lt;</a>");
            }
            // Walk through all the pages
            for (i=iPageFirst-1;i<loc_iPageNum && i < iPageLast; i++) {
              // Calculate the page number
              iNum = i+1;
              // Check if this is the current page
              if (i === loc_iPageCurrent) {
                lHtml.push("<a class='current' "+sEvent+" data-page='" + iNum + "'>" + iNum + "</a>");
              } else {
                lHtml.push("<a class='paging-page' "+sEvent+" data-page='" + iNum + "'>" + iNum + "</a>");
              }
            }
            // If the last page is not yet reached, then show next and last page items
            if (iPageLast < loc_iPageNum) {
                lHtml.push("<a class='paging-next' "+sEvent+" data-page='" + (loc_iPageCurrent+1) + "'>&gt;</a>");
                lHtml.push("<a class='paging-last' "+sEvent+" data-page='" + loc_iPageNum + "'>&gt;&gt;</a>");
            }
            
            
            // Add the pagination buttons
            $("#stylo-text-pagination").html(lHtml.join("\n"));
            // Return positively
            return true;
          } catch (err) {
            private_methods.showMessage("Fout in [showPaginationTextListview]: " + err.message);
            return false;
          }
        },
        /**
         * showCaResults
         *    Visualize the results of the cluster analysis
         *    
         *    Note: [oContents] contains
         *          dt = distance table
         *          loe = list of edges
         *          
         *          dt_table     - list of rows with values
         *          dt_rownames  - names of the author+booktitle
         *          dt_colnames  - PC1, PC2 etc
         *          dt_fulltable - Table including row and column names
         * 
         * @param {string} sTarget    - The <div> where the SVG needs to come
         * @param {object} oContents  - Object described above
         * @param {string} sMethod    - Can be: network, dendro, graph
         * @returns {Boolean}
         */
        showCaResults : function(sTarget, oContents, sMethod) {
          var lTable = [],
              lNames = [],      // Original order of names
              lTitle = [],      // Just the titles
              arName = [],      // Split version of name
              arNode = [],      // List of node information objects
              arHier = [],      // List of node objects used in hierarchy
              arLink = [],      // Array with link information
              options = {},
              author = {},      // List of authors
              full = {},        // List of author+title
              oTree = {},       // The hierarchical tree
              sFull = "",       // Full author + title
              sAuthor = "",     // Just the author
              i = 0,            // Counter
              iGroup = 1,       // Groups of authors
              iWidth = 800,     // Width of SVG
              iHeight = 500,    // Height of SVG
              iMaxWeight = 0.0, // Maximum weight
              iWeight = 0.0,    // Current link's weight
              iSource = -1,
              iTarget = -1;
          
          try {
            // Prepare the data: get the fulltable
            lTable = new_node(oContents['dt_fulltable']);
            lTable.splice(0,1);
            
            // Keep the original names in an array, 
            //  also produce a dictionary of authors and titles
            for (i=0;i<lTable.length;i++) {
              // Get the author + title
              sFull = lTable[i][0];
              // Make author and title available
              arName = sFull.split("_");
              // Keep an array of full information
              lNames.push(sFull);
              lTitle.push(arName[1]);
              // Process the title: put it into an object
              full[sFull] = i;
              // Process the author & title: put it into an object
              sAuthor = arName[0];
              if (!(sAuthor in author)) {
                // The 'author' dictionary provides a group number to each author
                author[sAuthor] = iGroup;
                iGroup += 1;
              }
              // Update a dictionary of node-information objects
              arNode.push({ 'index': i,  'id': sFull, 
                'group': author[sAuthor], 'name': sFull});
            }
            
            // Set the options that are always needed
            options['width'] = iWidth;
            options['height'] = iHeight;
            options['target'] = sTarget;
            options['legend'] = (! ('legend' in oContents)) ? "" : oContents['legend'];

            // Method-dependant actions
            switch(sMethod) {
              case "dendro": case "graph":
                // Make a hierarchy of nodes using the 'merge' table from R's hclust()
                oTree = create_hierarchy(new_node(oContents['cl_merge']));
                // Provide options needed for these methods
                options['tree'] = oTree;
                options['nodes'] = arHier;
                options['links'] = arLink;  // This is not actually used
                // The factor is calculated a bit ad-hoc
                options['factor'] = Math.min(iWidth, iHeight)/20;
                break;
              case "network":
                // We also need to have the array with links
                lTable = oContents['loe_table'];
                for (i=0;i<lTable.length;i++) {
                  iSource = full[lTable[i]['Source']];
                  iTarget = full[lTable[i]['Target']];
                  iWeight = parseInt(lTable[i]['Weight'], 10);
                  if (iWeight > iMaxWeight) {
                    iMaxWeight = iWeight;
                  }
                  // Provide a link between source and target *NODES*
                  arLink.push({'source': arNode[iSource], 
                               'target': arNode[iTarget],
                               'value': iWeight});
                }
                // Provide the options needed for this method
                options['nodes'] = arNode;
                options['links'] = arLink;
                options['factor'] = Math.min(iWidth, iHeight) / (2*iMaxWeight);
                break;
            }
            
            
            // Apply the correct method 
            switch(sMethod) {
              case "network":
                private_methods.create_ca_network(options);
                // Store the current options
                loc_ca_network = options;
                break;
              case "dendro":
                private_methods.create_ca_dendro(options);
                loc_ca_dendro = options;
                break;
              case "graph":
                private_methods.create_ca_graph(options);
                // Store the current options
                loc_ca_graph = options;
                break;
            }
            
            function new_node(oOld) {
              if (oOld === undefined || oOld === null) {
                return null;
              } else {
                return JSON.parse(JSON.stringify(oOld));
              }
            }
            
            // Create a source or target node for the hierarchical structure
            function create_node(iIndex, lMerge) {
              var iNode = -1, 
                  oNode = {},
                  iGroup = -1,
                  fWeight = 0.0,  // Weight of this combination (distance)
                  sTitle = "",
                  sName = "";
                  
              if (iIndex < 0) {
                iIndex += 1;
                iNode = full[lNames[-1 * iIndex]];
                sName = arNode[iNode]['name'];
                iGroup = arNode[iNode]['group'];
                sTitle = lTitle[-1 * iIndex];
                oNode = {"name": sName, "group": iGroup, "title": sTitle};
              } else {
                sName = iIndex.toString();  iGroup = 0;
                iIndex -= 1;
                // Use the weight that has been determined by hclust()
                fWeight = lMerge[iIndex]['weight'];
                // Create a node that combines the source & target
                oNode = {"name": sName, "group": iGroup, "weight": fWeight, 
                         "title": sName, "children": []};
                oNode['children'].push(new_node(lMerge[iIndex]['source']));
                oNode['children'].push(new_node(lMerge[iIndex]['target']));
                // Add links from the two children to their parent
                add_links(oNode);
              }  
              // Return the node that has been created
              return oNode;
            }
            
            function add_links(oNode) {
              var i = 0;
              
              // Add a link from the two children of [oNode] to [oNode] itself
              for (i=0;i<oNode['children'].length;i++) {
                arLink.push({'source': oNode['children'][0], 
                             'target': oNode,
                             'value': oNode['weight']});
              }
            }
            
            // Function that creates a hierarchy based on [lMerge]
            function create_hierarchy(lMerge) {
              var i=0,            // Counter
                  iSource = 0,    // Index of source node (neg/pos)
                  iTarget = 0,    // Index of the target node
                  fWeight = 0.0,  // Weight of this combination (distance)
                  iRow = 0,       // Row number
                  oMerge = {},    // One (new) object of lMerge
                  oNode = {},     // One node
                  oTree = {};     // The hierarchy we are returning
                  
              // Make a hierarchy of nodes using lMerge
              for (i=0;i<lMerge.length;i++) {
                iSource = lMerge[i][0];
                iTarget = lMerge[i][1];
                fWeight = lMerge[i][2];
                // Create a new object 
                oMerge = {'src_idx': iSource, 'tar_idx': iTarget, 
                          'weight': fWeight};
                // Add parameters to the tree that are not there already
                oMerge['source'] = create_node(iSource, lMerge);
                arHier.push(oMerge['source']);
                // Process the destination
                oMerge['target'] = create_node(iTarget, lMerge);
                arHier.push(oMerge['target']);
                // Replace row [i] in lMerge
                lMerge[i] = JSON.parse(JSON.stringify(oMerge));
              }
              // Create the top node that points to the children
              iRow = lMerge.length-1;
              fWeight = lMerge[iRow]['weight'];
              oTree = {"name": "root", "size": 0, "weight": fWeight, 
                       "title": "root", "children": []};
              oNode = new_node(lMerge[iRow]['source']);
              oTree['children'].push(oNode);
              arHier.push(oNode);
              oNode = new_node(lMerge[iRow]['target']);
              oTree['children'].push(oNode);    
              arHier.push(oNode);
              arHier.push(oTree);
              // Add links from the two children to their parent
              add_links(oTree);
              // Return the object that we have created
              return oTree;
            }
                        
            // Return positively
            return true;
          } catch (err) {
            private_methods.showMessage("Fout in [showCaResults]: " + err.message);
            return false;
          }
        },
        /**
         * create_ca_dendro
         *    Create a D3 dendrogram
         *    Side-glanced at: http://bl.ocks.org/anotherjavadude/2964485
         * 
         * @param {type} options
         * @returns {Boolean}
         */
        create_ca_dendro : function(options) {
          var svg,      // the SVG element within the DOM that is being used
              divSvg,   // The target svg div
              color,    // D3 color scheme
              factor,
              width,
              height,
              diagonal,
              root,     // Thesourc root node where it all starts
              rootw = 0,  // weight of the root node
              maxw = 0,   // The maximum width
              maxh = 0,   // Maximum height
              max_y = 0,  // Maximum 'y' coordinate (rotated)
              max_x = 0,  // Maximum 'x' coordinate (rotated)
              oRuler = {},
              p = {},
              lNodes = [],
              lLinks = [],
              nodeRadius = 3.5,
              bUseTree = false, // Use the 'tree' or the 'cluster' approach
              link,
              node;  
              
          try {
            // Validate the options
            if (!('nodes' in options && 'tree' in options && 
                  'target' in options && 'width' in options &&
                  'links' in options && 'height' in options)) { return false;}
            
            // Get parameters
            width = options['width'];
            height = options['height'];
            root = options['tree'];
            factor = ('factor' in options) ? options['factor'] : 1;

            // Initialize
            loc_simulation = null;
            maxw = width * 0.5;
            maxh = height * 0.9;
            
            // Define the SVG element and the color scheme
            divSvg = "#"+options['target']+ " svg";
            $(divSvg).empty();
            
            // Specify the SVG root and shift it a bit rightwards
            svg = d3.select(divSvg)
                .attr("transform", "translate(60, 0)");
            
            // Define the color scale
            color = d3.scale.category20();
            
            // Define the basic layout
            if (bUseTree) {
              loc_simulation = d3.layout.tree()
                      .size([maxw, maxh]);
                      //.separation(separate);
            } else {
              loc_simulation = d3.layout.cluster()
                      .size([maxw, maxh]);
                      // .separation(separate);
            }
            // Get a diagonal
            diagonal = d3.svg.diagonal()
                    .projection(function(d) {
                      // Changing x and y for the left to right tree
                      return [d.y, d.x];
                    });
            
            // Prepare the nodes and the links
            lNodes = loc_simulation.nodes(root);
            rootw = root.weight;
            // Make the [y] coordinate dependant upon weight
            lNodes.forEach(function(d) {
              if ('y' in d ) {
                // If the node has no 'weight', it is an endnode
                if ('weight' in d) {
                  // This is a real node: take the weight as y
                  d.y = (rootw - d.weight) * (maxw - 50) / rootw;
                } else {
                  // This is an endnode: take the 'y' of the parent + fixed offset
                  d.y = d.parent.y + 30;
                  d.y = d.parent.y;
                }
                
              }
            });
            lLinks = loc_simulation.links(lNodes);
            
            // Work on the svg
            link = svg.selectAll("pathlink")
                    .data(lLinks)
                    .enter().append("svg:path")
                    .attr("class", "ca-link")
                    .attr("d", dendro_path);
            node = svg.selectAll("g.node")
                    .data(lNodes)
                    .enter().append("svg:g")
                    .attr("transform", function(d) {
                      return "translate("+d.y+","+d.x+")";
                    });
                    
            // Add a dot at every node
            node.append("svg:circle")
                    .attr("class", "ca-node-dot") // Define this class above
                    .attr("r", nodeRadius)
                .append("title")
                .text(function(d) { 
                  var w = ('weight' in d) ? d.weight : "(weight: see parent)";
                  return w;
                });;
            // Provide colors on the nodes, depending on the author=group
            node.select("circle")
              .style("fill", function(d) {
                var col = ('weight' in d) ? 0 : color(d.group);
                return col;
              });
            
            // Place the name attribute left or right, depending on children
            node.append("svg:text")
                    .attr("text-anchor", function(d) {
                      return d.children ? "end" : "start";
                    })
                    .attr("dx", function(d) {
                      var gap = 2 * nodeRadius;
                      var new_dx = d.children ? -gap : gap;
                      return new_dx;
                    })
                    .attr("dy", 3)
                    .attr("class", "ca-text")
                    .text(function(d) {
                      var sText = (/^(\d+)$/.test(d.name)) ? "" : d.name;
                      return sText;
                    });
            // Provide colors on the nodes, depending on the author=group
            node.select("text")
              .style("fill", function(d) {
                var col = ('weight' in d) ? 0 : color(d.group);
                return col;
              });
              
            // Add a ruler at the bottom of the picture
            oRuler = private_methods.create_ca_ruler({
                  "max": rootw, "height": max_x, "width": maxw,
                  "factor": max_y / rootw
                });
            svg.append("svg:g")
                .append("svg:path")
                .attr("class", "ca-ruler")
                .attr("d", oRuler['path']);
            // Append the text for all rulers
            oRuler['points'].forEach(function(d) {
              svg.append("svg:g")
                 .append("svg:text")
                 .attr("x", d.x)
                 .attr("y", d.y + 15)
                 .attr("class", "ca-rulertext")
                 .text(d.num);
            });
            
            // Append a legend
            private_methods.addLegend({
              'x': (oRuler['points'][0].x + 
                      oRuler['points'][oRuler['points'].length-1].x) / 2,
              'y': oRuler['points'][0].y + 30,
              'divsvg': divSvg,
              'legend': options['legend']});
            
            // Draw the path to mimic the behaviour of the dendrogram drawn by "R"
            function dendro_path(d,i) {
              var lPath = [];
              
              // Do we have children?
              if (d.source.children) {
                // Find out the minimum 'y' from the children
                var min_y = Math.min(d.source.children[0].y, d.source.children[1].y);
                var half_y = (d.source.y + min_y) / 2;
                // Starting point: d.source
                lPath.push("M " + d.source.y + "," + d.source.x);
                // Go horizontal to halfway y
                lPath.push("H " + half_y);
                // Go vertical to the target point
                lPath.push("V " + d.target.x);
                // Go horizontal to the target point
                lPath.push("H " + d.target.y);
                // Adapt the 'global'  variable max_y
                max_y = Math.max(max_y, d.source.y, d.target.y);
                max_x = Math.max(max_x, d.source.x, d.target.x);
              }
              var sPath = lPath.join(" ");
              return sPath;
            }
            
            return true;
          } catch (err) {
            private_methods.showMessage("Fout in [create_ca_dendro]: " + err.message);
            return false;
          }
        
        },
        /**
         * create_ca_ruler
         *    Create the SVG code for a ruler using the parameters specified
         *    in the [options] object
         * 
         * @param {object} options
         * @returns {String}
         */
        create_ca_ruler : function(options) {
          var sRuler = "",  // The SVG text we return
              x, y,         // My own local working coordinates
              right,        // Rightmost side
              num,          // The number of intervals to make
              factor,       // Multiplication factor
              i,            // Counter general purpose
              oBack = {},   // The object we return
              lPath = [];   // Used to create the total path
      
          try {
            // Validate
            if (! ("max" in options && "height" in options && 
                   "width" in options && "factor" in options)) { return "";}
            // Initializations
            factor = options['factor'];
            x = options['max'] * factor;
            right = x;
            y = options['height'] + 20;
            num = Math.floor(options['max']);
            oBack['path'] = "";
            oBack['points'] = [];
            // Define the starting point
            lPath.push("M " + x + "," + y);
            // Draw a horizontal line 
            lPath.push("h -" + num * factor);
            // Create all the vertical short strokes at 0, 1, ... num
            for (i=0;i<=num;i++) {
              x = (right - (i * factor));
              lPath.push("M " + x + "," + y);
              lPath.push("v 10");
              oBack['points'].push({'x': x, 'y': y+10, 'num': i});
            }
            sRuler = lPath.join(" ");
            oBack['path'] = sRuler;
                  
            // Return the ruler code we made
            return oBack;
          } catch (err) {
            private_methods.showMessage("Fout in [create_ca_ruler]: " + err.message);
            return "";
          }
        },
        /**
         * create_ca_graph
         *    Create a 'collapsable force layout' in the spirit of this:
         *      https://bl.ocks.org/mbostock/1093130
         * 
         * @param {type} options
         * @returns {Boolean}
         */
        create_ca_graph : function(options) {
          var svg,      // the SVG element within the DOM that is being used
              divSvg,   // The target svg div
              color,    // D3 color scheme
              factor,
              width,
              height,
              root,     // Thesourc root node where it all starts
              p = {},
              link,
              node;  
              
          try {
            // Validate the options
            if (!('nodes' in options && 'tree' in options && 
                  'target' in options && 'width' in options &&
                  'links' in options && 'height' in options)) { return false;}
            
            // Initialize
            loc_simulation = null;
            
            // Get parameters
            width = options['width'];
            height = options['height'];
            root = options['tree'];
            factor = ('factor' in options) ? options['factor'] : 1;
            
            // Define the SVG element and the color scheme
            divSvg = "#"+options['target']+ " svg";
            $(divSvg).empty();
            
            // Specify the SVG root
            svg = d3.select(divSvg);
            // Define the link and the node parts
            link = svg.selectAll(".ca-link");
            node = svg.selectAll(".ca-node");
            
            // Append a legend
            private_methods.addLegend({
              'x': width / 2,
              'y': height - 50,
              'divsvg': divSvg,
              'legend': options['legend']});
            
            // Define the color scale
            color = d3.scale.category20();
            
            loc_simulation = d3.layout.force()
                .linkDistance(function(d) {
                  var iDefault = 50,
                      value = 0,
                      src = null; // Link is from source to target
                      
                  // Validate
                  if (d===undefined || d === null) return iDefault;
                  src = d.source;
                  if (src === undefined || src === null) return iDefault;
                  // Get the weight of the parent
                  value = src.weight;
                  // This determines the size of each link
                  return value * factor;
                })
                .charge(-120)
                .gravity(0.05)
                .size([width, height])
                .on("tick", ticked);
      
            // Initialize simulation by calling update
            update();
            
            // Define what needs to take place when updating
            function update() {
              var nodeEnter = null,
                  nodes = [], // List of current nodes
                  links = []; // List of current links
                  
              // Get a list of current nodes and links
              nodes = flatten(root);
              links = d3.layout.tree().links(nodes);
              
              // Restart the force layout
              loc_simulation
                      .nodes(nodes)
                      .links(links)
                      .start();
              
              // Update links
              link = link.data(links, function(d) { return d.target.id; });
              // Not sure what this does:
              link.exit().remove();
              // Add a line to represent the link
              link.enter().insert("line", ".ca-node")
                      .attr("class", "ca-link");
              
              // Update nodes
              node = node.data(nodes, function(d) {return d.id;});
              // Again: not sure what this does
              node.exit().remove();
              // Add  <g> under every node
              // Make sure that 'drag' is activated upon a click event
              nodeEnter = node.enter().append("g")
                      .attr("class", "ca-node")
                      .on("click", click)
                      .call(loc_simulation.drag);
              // Add a circle to represent the node
              // Note: the size can be made data-dependent through the function
              nodeEnter.append("circle")
                .attr("r", function(d) {
                  // size depends on collapsed/expanded/leaf
                  var size = d._children ? 20 : d.children ? 13 : 8;
                  return size;
                });           
              // Add text to each node: the name
              nodeEnter.append("text")
                .attr("dy", ".35em")
                .text(function(d) { 
                  return d.title;
              });
              node.append("title")
                .text(function(d) { return d.name; });
              // Provide colors on the nodes, depending on the author=group
              node.select("circle")
                .style("fill", function(d) {
                  return color(d.group);})
                .attr("r", function(d) {
                  // size depends on collapsed/expanded/leaf
                  var size = d._children ? 20 : d.children ? 13 : 8;
                  return size;
                });           
            }
            
            // Define the 'ticked' function
            function ticked() {
              link
                  .attr("x1", function(d) { return d.source.x; })
                  .attr("y1", function(d) { return d.source.y; })
                  .attr("x2", function(d) { return d.target.x; })
                  .attr("y2", function(d) { return d.target.y; });
              node
                  .attr("transform", function(d) { 
                    return "translate(" + d.x + "," + d.y + ")"; 
                  });            
            }

            // Toggle children on click.
            function click(d) {
              // Check if we need to ignore dragging
              if (d3.event.defaultPrevented) {
                // ignore drag if 'prevented' is set
                return;
              } 
              // Does this node have any children?
              if (d.children) {
                // Yes: hide the children
                d._children = d.children;
                d.children = null;
                // TODO: show that children have been hidden

              } else {
                // Node has no children: recover the hidden ones
                d.children = d._children;
                d._children = null;
                // TODO: remove what shows children were hidden

              }
              // Now update the visualisation
              update();
            }

            // Get a list of nodes under [root]
            function flatten(ndStart) {
              var lNodes = [],  // List of nodes under root
                  i = 0;        // Counter that starts with 0

              // Function to recursively find and add nodes
              function recurse(ndLocal) {
                if (ndLocal.children) {
                  ndLocal.children.forEach(recurse);
                }
                if (!ndLocal.id) {
                  ndLocal.id = ++i;
                }
                lNodes.push(ndLocal);
              }

              // Perform recursive tracking on the [root] we got
              recurse(ndStart);
              // Return the list of nodes
              return lNodes;
            }

            // Return positively
            return true;
          } catch (err) {
            private_methods.showMessage("Fout in [create_ca_graph]: " + err.message);
            return false;
          }
        },
        /**
         * create_ca_network
         *    Create a force-directed network for Cluster Analysis
         * 
         * @param {type} options
         * @returns {Boolean}
         */
        create_ca_network : function(options) {
          var svg,      // the SVG element within the DOM that is being used
              divSvg,   // The target svg div
              color,    // D3 color scheme
              factor,
              width,
              height,
              p = {},
              link,
              node;  
              
          try {
            // Validate the options
            if (!('nodes' in options && 'links' in options && 
                  'target' in options && 'width' in options &&
                  'height' in options)) { return false;}
            
            // Initialize
            loc_simulation = null;
            
            // Get parameters
            width = options['width'];
            height = options['height'];
            factor = options['factor'];
            
            // Define the SVG element and the color scheme
            divSvg = "#"+options['target']+ " svg";
            $(divSvg).empty();
            svg = d3.select(divSvg);
            // color = d3.scaleOrdinal(d3.schemeCategory20);
            // color = d3.scale.ordinal();
            color = d3.scale.category20();
            
            // Append a legend
            private_methods.addLegend({
              'x': width / 2,
              'y': height - 50,
              'divsvg': divSvg,
              'legend': options['legend']});
            
            // Define a d3 function based on the information in 'nodes' and 'links'
            link = svg.append("g")
                      .attr("class", "links")
                      .selectAll("line")
                      .data(options['links'])
                      .enter().append("line")
                      .attr("stroke-width", function(d) { 
                          return Math.sqrt(d.value); 
                      });
            node = svg.append("g")
                      .attr("class", "nodes")
                      .selectAll("circle")
                      .data(options['nodes'])
                      .enter().append("circle")
                      .attr("r", 5)
                      .attr("fill", function(d) { 
                        return color(d.group); 
                      });
              
            loc_simulation = d3.layout.force()
                .nodes(options['nodes'])
                .links(options['links'])
                .charge(-100)
                .linkDistance(function(d) {
                  // This determines the size of each link
                  return d.value * factor;
                })
                .gravity(0.1)
                .theta(0.8)
                .alpha(0.1)
                .size([width, height])
                .on("tick", ticked);
      
                      
            // Add popup title to nodes;
            node.append("title")
              .text(function(d) { return d.id; });
            // Add popup title to links: this provides the actual weight
            link.append("title")
                    .text(function(d) {return d.value;});
      
            // Then execute the simulation
            loc_simulation.start();
            
            // Define the 'ticked' function
            function ticked() {
              link
                  .attr("x1", function(d) { return d.source.x; })
                  .attr("y1", function(d) { return d.source.y; })
                  .attr("x2", function(d) { return d.target.x; })
                  .attr("y2", function(d) { return d.target.y; });
              node
                  .attr("cx", function(d) { return d.x; })
                  .attr("cy", function(d) { return d.y; });            
            }
            
            // Return positively
            return true;
          } catch (err) {
            private_methods.showMessage("Fout in [create_ca_network]: " + err.message);
            return false;
          }
        },
        /**
         * showPcaResults
         *    Visualize the results of the principle components analysis
         *    
         *    Note: [oContents] contains
         *          table     - list of rows with values
         *          rownames  - names of the author+booktitle
         *          colnames  - PC1, PC2 etc
         *          fulltable - Table including row and column names
         * 
         * @param {type} sTarget
         * @param {type} oContents
         * @returns {Boolean}
         */
        showPcaResults : function(sTarget, oContents) {
          var lData = [],   // The data to be used in the scatter plot
              lTable = [],
              lCombi = [],
              lRow = [],      // One row of data 
              arName = [],    // Split version of name
              sAuthor = "",
              divSvg = "",
              p = {},
              iWidth = 800,   // Width of SVG
              iHeight = 500,  // Height of SVG
              i = 0,          // Counter
              j = 0,          // Counter
              iSize = 10,     // Size of the scatter points (fixed right now)
              // This is for now unused:
              shapes = ['circle', 'cross', 'triangle-up', 'triangle-down', 'diamond', 'square'];
          
          try {
            // Prepare the data: sort the table
            lTable = oContents['fulltable'];
            lTable.splice(0,1);
            lTable = lTable.sort( function(a,b) {
              var sNameA = a[0], sNameB = b[0];
              return (sNameA > sNameB) ? 1 : ( (sNameB > sNameA) ? -1 : 0);
            });
            
            // Prepare the data: split name of author and name of text
            for (i=0;i<lTable.length;i++) {
              arName = lTable[i][0].split("_");
              // Is this a new author?
              if (sAuthor === arName[0]) {
                // Add information
                lCombi[lCombi.length-1].points.push({pc1: lTable[i][1], pc2: lTable[i][2], text: arName[1]});
              } else {
                // Create a new entry
                lCombi.push({author: arName[0], points: [{pc1: lTable[i][1], pc2: lTable[i][2], text: arName[1]}]});
                sAuthor = arName[0];
              }
            }
            
            // Make sure we know where the target is going to appear
            divSvg = "#" + sTarget + " svg";
            
            // Calculate how the graph is going to be
            nv.addGraph(function() {
              // Set the width and height
              //var iWidth=800, iHeight=500;
              // Get the range
              var rng = d3.scale.category10().range();
              // Define the chart to be used
              var chart = nv.models.scatterChart()
                      .showDistX(true)
                      .showDistY(true)
                      .width(iWidth)
                      .height(iHeight)
                      .color(rng);
              
              // Set the tooltip of the chart
              chart.tooltip.contentGenerator(function(obj) {
                var series = obj.series[0],       // One series
                    pointIndex = obj.pointIndex,  // The currently indexed point
                    sKey = series.key,            // Get the key to the series
                    html = [];                    // Start output
                    
                    
                // Header: author + title
                html.push("<h3>"+sKey+"</h3>");
                html.push(series.values[pointIndex].textName);
                // Start table
                html.push("<table>");
                // Add one row for each PC scale
                html.push("<tr><td>PC1:</td><td>" + series.values[pointIndex].x + "</td></tr>" );
                html.push("<tr><td>PC2:</td><td>" + series.values[pointIndex].y + "</td></tr>" );
                // Finish table
                html.push("</table>");
                // Return the result
                return html.join("\n");
              });
              
              // Axis settings
              chart.xAxis.tickFormat(d3.format('.02f'));
              chart.yAxis.tickFormat(d3.format('.02f'));
              
              // Show shapes other than circles
              // chart.scatter.onlyCircles(false);
              
              // Define the data
              for (i=0;i<lCombi.length;i++) {
                // Get this row
                lRow = lCombi[i];
                // Specify the group key
                lData.push({key: lRow['author'], values: []});
                // Specify the points: just one?
                for (j=0;j<lRow.points.length;j++) {
                  lData[i].values.push({
                    x: lRow.points[j].pc1, 
                    y: lRow.points[j].pc2,  // PC1,PC2
                    textName: lRow.points[j].text,
                    size: iSize,            // Fixed size for now
                    shape: 'circle'         // Fixed shape for now
                  });
                }
              }
              
              // Define the SVG element and the color scheme
              $(divSvg).empty();
              // Put the data into the chart
              d3.select(divSvg)
                .datum(lData)
                .attr('width', iWidth)
                .attr('height', iHeight)
                .attr('viewBox', '0 0 ' + iWidth + ' ' + iHeight)
                .style({ 'width': iWidth + " !important", 'height': iHeight + " !important" })
                .transition().duration(500)
                .call(chart);
              
              // Add a legend to the table
              private_methods.addLegend({
                'x': iWidth / 2,
                'y': iHeight + 50,
                'divsvg': divSvg,
                'legend': oContents['legend']});

              // Make sure it is drawn correctly
              nv.utils.windowResize(chart.update);
              
              // Position it higher
              d3.select(divSvg)
                  .attr("transform", "translate(0, -100)");
              
              // Return the result
              return chart;
            });
            
            // Return positively
            return true;
          } catch (err) {
            private_methods.showMessage("Fout in [showPcaResults]: " + err.message);
            return false;
          }
        },
        /**
         * showSearchOrder
         *    Show the search order correctly according to [loc_sSort] and [sSortType]
         * 
         * @param {string} sSortType
         * @returns {Boolean}
         */
        showSearchOrder : function(sSortType) {
          var sListviewType,  // Kind of view
              sSortDir,       // Direction of sorting
              sDesc,          // Element descending
              sAsc;           // Element ascending
              
          try {
            switch (sSortType) {
              case "word": sListviewType = "frequencies";
                sDesc = "#stylo-lemma-sort-desc";
                sAsc = "#stylo-lemma-sort-asc";
                sSortDir = loc_sSortWord;
                break;
              case "freq": sListviewType = "frequencies";
                sDesc = "#stylo-freq-sort-desc";
                sAsc = "#stylo-freq-sort-asc";
                sSortDir = loc_sSortFreq;
                break;
              case "author": sListviewType = "corpus";
                sDesc = "#stylo-name-sort-desc";
                sAsc = "#stylo-name-sort-asc";
                sSortDir = loc_sSortAuthor;
                break;
              case "title": sListviewType = "corpus";
                sDesc = "#stylo-title-sort-desc";
                sAsc = "#stylo-title-sort-asc";
                sSortDir = loc_sSortTitle;
                break;
              case "year": sListviewType = "corpus";
                sDesc = "#stylo-year-sort-desc";
                sAsc = "#stylo-year-sort-asc";
                sSortDir = loc_sSortYear;
                break;
            }
            // Remove inactive everywhere
            $("#stylo-lemma-sort-desc a").first().removeClass("inactive");
            $("#stylo-lemma-sort-asc a").first().removeClass("inactive");
            $("#stylo-freq-sort-desc a").first().removeClass("inactive");
            $("#stylo-freq-sort-asc a").first().removeClass("inactive");
            $("#stylo-name-sort-desc a").first().removeClass("inactive");
            $("#stylo-name-sort-asc a").first().removeClass("inactive");
            $("#stylo-title-sort-desc a").first().removeClass("inactive");
            $("#stylo-title-sort-asc a").first().removeClass("inactive");
            $("#stylo-year-sort-desc a").first().removeClass("inactive");
            $("#stylo-year-sort-asc a").first().removeClass("inactive");
            // Action depends on the sort direction
            switch (sSortDir) {
              case "asc":
                $(sDesc).children("a").first().removeClass("inactive");
                $(sAsc).children("a").first().addClass("inactive");
                break;
              case "desc":
                $(sDesc).children("a").first().addClass("inactive");
                $(sAsc).children("a").first().removeClass("inactive");
                break;
            }
            // Return positively
            return true;
          } catch (err) {
            private_methods.showMessage("Fout in [showSearchOrder]: " + err.message);
            return false;
          }
        },
        showStyloSummary: function(options) {
          var sHtml = "";
          
          if (options !== undefined) {
            sHtml = private_methods.getSummary(options);
            $("#stylometry-summary").html(sHtml);
          }
          $("#stylometry-summary").removeClass("hidden");            
        },
        /**
         * showTextListview
         *    Show the currently available texts in listview
         * 
         * @param {string}  sSortType - kind of information to focus on
         * @param {integer} iStart    - starting element (only relevant for some)
         * @param {string}  sSortDir  - direction of sorting (asc, desc)
         * @returns {Boolean}
         */
        showTextListview : function(sSortType, iStart, sSortDir) {
          var lHtml = [],
              iNum = 0,
              oAuthor = {}, // Author object
              oInfo = {},   // Info on current document
              iEnd = 0,     // Last item to visit
              iStep = 1,    // Ascending: 1, Descending: -1
              i,j;          // Counter
      
          try {
            // Validate
            if (loc_lDocInfo.length ===0 ) {
              // Nothing to show
              private_methods.showMessage("Sorry, text information cannot be shown");
              // Hide it
              $("#output-level-2").addClass("hidden");
              return true;
            }
            // Start output
            lHtml.push("<thead class=\"auto-style2\"><tr><th>#</th><th>Jaar</th><th>Auteur</th><th>Titel</th></tr></thead><tbody>");
            
            switch(sSortType) {
              case "author":
                // Walk the paged results in loc_lAuthorInfo
                switch (sSortDir) {
                  case "asc":
                    // Sort the author information
                    loc_lAuthorInfo.sort(function(a,b) {
                      var aName = a['lastname']+a['fullname'];
                      var bName = b['lastname']+b['fullname'];
                      return ((aName < bName) ? -1 : ((aName > bName) ? 1 : 0));
                    });
                    break;
                  case "desc":
                    // Sort the author information
                    loc_lAuthorInfo.sort(function(a,b) {
                      var aName = a['lastname']+a['fullname'];
                      var bName = b['lastname']+b['fullname'];
                      return ((aName < bName) ? 1 : ((aName > bName) ? -1 : 0));
                    });
                    break;
                }
                // Determine the end
                iEnd = Math.min(loc_lAuthorInfo.length, iStart + loc_iPageSize);
                // Start walking
                for (i=iStart;i<iEnd;i++) {
                  // Get number of this result
                  iNum = i+1;
                  // Access the informatino for this result
                  oInfo = loc_lAuthorInfo[i];
                  // Show the information for the row: start off by providing the number
                  lHtml.push("<tr><td>"+iNum+"</td>");
                  // Provide publication year
                  lHtml.push("<td nowrap>"+oInfo['birthyear']+"-"+oInfo['deathyear']+" <i>"+oInfo['gender']+"</i></td>");
                  // Provide author's name
                  lHtml.push("<td nowrap>"+oInfo['fullname']+"</td>");
                  // Provide all titles the author worked with
                  lHtml.push("<td>");
                  for (j=0;j<oInfo['titles'].length;j++) {
                    if (j>0) {lHtml.push("<br>");}
                    lHtml.push("<span class='titleinfo'>"+oInfo['titles'][j]+"</span>");
                  }
                  lHtml.push("</td>");
                  lHtml.push("</tr>");
                }
                break;
              case "title":
                break;
              default:            
                // Walk all the results in loc_lDocInfo
                for (i=0;i< loc_lDocInfo.length;i++) {
                  // Calculate the number of this result
                  iNum = i + 1 + loc_iPageCurrent * loc_iPageSize;
                  // Get the results of this document
                  oInfo = loc_lDocInfo[i];
                  // Show the information for the row: start off by providing the number
                  lHtml.push("<tr><td>"+iNum+"</td>");
                  // Provide publication year, author and title
                  lHtml.push("<td>"+oInfo['year']+"</td>");
                  lHtml.push("<td>"+oInfo['fullname']+"</td>");
                  lHtml.push("<td><a onclick=\"nederlab.stylometry.toggleDocInfo(this);\">"+oInfo['title']+"</a></td>");
                  lHtml.push("</tr>");
                  // Provide a hidden row with additional information
                  lHtml.push("<tr class='hidden docinfo'><td colspan='4' ><table>");
                  lHtml.push("<tr><td>Titel</td><td>"+oInfo['title']+"</td></tr>");
                  lHtml.push("<tr><td>Editie</td><td>"+oInfo['edition']+"</td></tr>");
                  lHtml.push("<tr><td>Publicatie</td><td>"+oInfo['year']+"</td></tr>");
                  lHtml.push("<tr><td>Genre(s)</td><td>"+oInfo['genres']+"</td></tr>");
                  // List the authors
                  lHtml.push("<tr><td colspan='2'>Auteurs:</td></tr>");
                  lHtml.push("<tr><td colspan='2'><table><thead><tr><th>Achternaam</th><th>Voornaam</th><th>Geboren</th><th>Overleden</th><th>Geslacht</th></tr></thead><tbody>");
                  // Walk them
                  for (j=0;j<oInfo['authors'].length;j++) {
                    oAuthor = oInfo['authors'][j];
                    lHtml.push("<tr>");
                    lHtml.push("<td>"+oAuthor['lastname']+"</td>");
                    lHtml.push("<td>"+oAuthor['firstname']+"</td>");
                    lHtml.push("<td>"+oAuthor['birthyear']+"</td>");
                    lHtml.push("<td>"+oAuthor['deathyear']+"</td>");
                    lHtml.push("<td>"+oAuthor['gender']+"</td>");
                    lHtml.push("</tr>");
                  }              
                  lHtml.push("</tbody></table></td></tr>");
                  lHtml.push("</table></td></tr>");
                }
                break;
            }
            
            // Finish table
            lHtml.push("</tbody>");
            $("#output-level-2-table").html(lHtml.join("\n"));
            
            // Reveal it
            $("#output-level-2").removeClass("hidden");
            
            // Show the pagination and the sorting options
            $("#resultOrganizer-2").removeClass("hidden");
            
            // Return positively
            return true;
          } catch (err) {
            private_methods.showMessage("Fout in [showTextListview]: " + err.message);
            return false;
          }          
        },
        /**
         * showStylometryInfo
         *    Show the necessary stylometry information
         * 
         * @returns {undefined}
         */
        showStylometryInfo : function() {
          var lHtml = [],
              oMfw = {},
              oDocFreq = {},
              i,j,
              data;
          
          try {
            // Validate
            if (loc_lResultMfw.length ===0 || loc_lResultFreq.length ===0 ) {
              // Nothing to show
              private_methods.showMessage("Sorry, stylometry information cannot be shown");
              // Hide it
              $("#output-level-1").addClass("hidden");
              return true;
            }
            // Start output
            lHtml.push("<thead class=\"auto-style2\"><tr><th>#</th><th>Woord</th>");
            for (i=0;i<loc_iDocTotal;i++) {
              lHtml.push("<th>bron_"+(i+1)+"</th>");
            }
            lHtml.push("</tr></thead><tbody>");
            // Produce a line with the file sizes
            lHtml.push("<tr><td>SIZE</td><td>-</td>");
            for (j=0;j<loc_iDocTotal;j++) {
              lHtml.push("<td align='right'>"+loc_lResultFreq[j]['total'] + "</td>");
            }
            lHtml.push("</tr>");
            // Walk through the Mfw and Doc lists
            for (i=0;i<loc_lResultMfw.length;i++) {
              // Get the MFW and the DOCFREQ information
              oMfw = loc_lResultMfw[i];
              // Produce a line of output
              lHtml.push("<tr><td>"+(i+1)+"</td><td>"+oMfw['lemma'] +"</td>");
              // Walk all the documents
              for (j=0;j<loc_iDocTotal;j++) {
                oDocFreq = loc_lResultFreq[j]['list'][i];
                try {
                  lHtml.push("<td align='right'di>"+oDocFreq['freq']+"</td>");
                } catch (err) {
                  private_methods.showMessage("Fout in [showStylometryInfo]: " + err.message);
                  return false;
                }
              }
              lHtml.push("</tr>");
            }
            // Finish table
            lHtml.push("</tbody>");
            $("#output-level-1-table").html(lHtml.join("\n"));
            
            // Reveal it
            $("#output-level-1").removeClass("hidden");
            // Return positively
            return true;
          } catch (err) {
            private_methods.showMessage("Fout in [showStylometryInfo]: " + err.message);
            return false;
          }
        },

        /**
         * showTextInfo
         *    Show the necessary information on the texts used
         * 
         * @returns {undefined}
         */
        showTextInfo : function() {
          var lHtml = [],
              oMfw = {},
              oDocFreq = {},
              i,j,
              data;
          
          try {
            // Validate
            if (loc_lResultMfw.length ===0 || loc_lResultFreq.length ===0 ) {
              // Nothing to show
              private_methods.showMessage("Sorry, text information cannot be shown");
              // Hide it
              $("#output-level-1").addClass("hidden");
              return true;
            }
            // Start output
            lHtml.push("<thead class=\"auto-style2\"><tr><th>#</th><th>Woord</th>");
            for (i=0;i<loc_iDocTotal;i++) {
              lHtml.push("<th>bron_"+(i+1)+"</th>");
            }
            lHtml.push("</tr></thead><tbody>");
            // Walk through the Mfw and Doc lists
            for (i=0;i<loc_lResultMfw.length;i++) {
              // Get the MFW and the DOCFREQ information
              oMfw = loc_lResultMfw[i];
              // Produce a line of output
              lHtml.push("<tr><td>"+(i+1)+"</td><td>"+oMfw['lemma'] +"</td>");
              // Walk all the documents
              for (j=0;j<loc_iDocTotal;j++) {
                oDocFreq = loc_lResultFreq[j]['list'][i];
                lHtml.push("<td>"+oDocFreq['freq']+"</td>");
              }
              lHtml.push("</tr>");
            }
            // Finish table
            lHtml.push("</tbody>");
            $("#output-level-2-table").html(lHtml.join("\n"));
            
            // Reveal it
            $("#output-level-2").removeClass("hidden");
            // Return positively
            return true;
          } catch (err) {
            private_methods.showMessage("Fout in [showTextInfo]: " + err.message);
            return false;
          }
        },      
        /**
         * showVisualisation
         *    Hide all other visualisations, only showing the selected one
         * 
         * @param {type} iNumber
         * @returns {undefined}
         */
        showVisualisation : function(iNumber) {
          var lVisual = ['#stylo-visualisatie', '#stylo-visualisatie2',
                         '#stylo-visualisatie3'],
              lMethod = ["network", "graph", "dendro"],
              i=0;
      
          // Initially clear all visualisaties
          for (i=0;i<lVisual.length;i++) {
            $(lVisual[i]).addClass("hidden");
          }
          if (iNumber === undefined) {
            // By default just show visualisatie #1
            iNumber = 1;
          }
          // Show what we have
          $(lVisual[iNumber-1]).removeClass("hidden");
          // Trigger the visualisation afresh
          switch(lMethod[iNumber-1]) {
            case "network":
              private_methods.create_ca_network(loc_ca_network);
              break;
            case "graph":
              private_methods.create_ca_graph(loc_ca_graph);
              break;
            case "dendro":
              private_methods.create_ca_dendro(loc_ca_dendro);
              break;
          }
        },
        /**
         * showZoekterm
         *    Make the $zoekterm variable available again to the user
         * 
         * @returns {Boolean}
         */
        showZoekterm : function() {
          try {
            // Check if zoekterm is empty
            if (loc_sZoekterm === "" || loc_sZoekterm === "(leeg)") {
              // Try to fill it from 
              loc_sZoekterm = decodeURIComponent($("#stylo-zoekterm").val());
            } 
            // Check if the display is empty
            $("#stylometry-crp-zoekterm").html(loc_sZoekterm);
            
            // Indicate all is well
            return true;
          } catch (err) {
            private_methods.showMessage("Fout in [showZoekterm]: " + err.message);
            // Signal error
            return false;
          }
        },
        /**
         * stopAjaxCalls
         *    Stop the currently running AJAX call (if any)
         * 
         * @returns {undefined}
         */
        stopAjaxCall : function() {
          if (loc_xhr !== undefined && loc_xhr !== null) {
            try {
              loc_xhr.abort();
            } catch (err) {
              // No need to do anything here
            }
          }
        },
        /**
         * storeZoekterm
         *    Store the $zoekterm variable where we can retrieve it later
         * 
         * @param {type} sTerm    -- The zoekterm to be stored
         * @param {type} bEncode  -- Encode the zoekterm URI
         * @returns {undefined}
         */
        storeZoekterm : function(sTerm, bEncode) {
          // Validate
          if (sTerm === undefined) return;
          if (bEncode !== undefined && bEncode) {
            // Convert the zoekterm
            sTerm = encodeURIComponent(sTerm);
          }
          $("#stylo-zoekterm").val(sTerm);          
        },
        
        /**
         * styloAnalysePca
         *    Perform a PCA using Stylo
         * 
         * @param {type} lData
         * @param {type} options
         * @returns {Boolean|undefined}
         */
        styloAnalysePca : function(lData, options) {
          return private_methods.doPcaThroughNstylo(lData, options);
        },
        
        /**
         * toggleShowGeneral
         *    General purpose show/hide function
         * 
         * @param {type} sTonen
         * @param {type} sVerbergen
         * @param {type} sHidable
         * @param {type} sButton
         * @returns {undefined}
         */
        toggleShowGeneral : function(sTonen, sVerbergen, sHidable, sButton) {
          // Check where we are
          if ($(sHidable).hasClass("hidden")) {
            // Show it
            $(sHidable).removeClass("hidden");
            // Change the button
            $(sButton).html(sVerbergen);
          } else {
            // Show it
            $(sHidable).addClass("hidden");
            // Change the button
            $(sButton).html(sTonen);
          }
        }
        
      };

      // ================== START OF PUBLIC PART ==============================
      return {
        /**
         * addEventHandlers - set event handlers
         * 
         * @param {object} options
         * @returns {void}
         */
        addEventHandlers : function(options) {
          private_methods.handleResultaatacties(options);
        },
        ca_dragended : function(d) {
          if (!d3.event.active) loc_simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        },
        ca_dragged : function(d) {
          d.fx = d3.event.x;
          d.fy = d3.event.y;          
        },
        ca_dragstarted : function(d) {
          if (!d3.event.active) loc_simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;        
        },
        displayStylometryTask : function() {
          // Empty code
        },
        displaySamplingSize : function() {
          var iMin,
              oSize = {},
              divMethod = "#stylo-sampling-method",
              divSetSize = "#stylo-samplesize",
              divSize = "#stylo-sampling-size";
      
          try {
            // At least get the size(s)
            oSize = private_methods.getDocSizes();
            iMin = (oSize !== null && 'min'in oSize) ? oSize['min'] : 10000;
            // Check what has been selected
            switch($(divMethod).val()) {
              case "no":
                $(divSize).addClass("hidden");
                break;
              case "normal":
                // Set the size to the minimum doc size
                $(divSetSize).val(parseInt(iMin,10));
                $(divSize).removeClass("hidden");
                break;
              case "rndpos":
                // Set the size to the minimum doc size
                $(divSetSize).val(parseInt(Math.floor(iMin/10),10));
                $(divSize).removeClass("hidden");
                break;
            }
          } catch (err) {
            private_methods.showMessage("Fout in [displaySamplingSize]: " + err.message);
          }
        },
        /**
         * init
         *    Initialize the stylometry function
         * 
         * @param {type} queries
         * @returns {undefined}
         */
        init : function (queries) {
          var formquery = {},   // Query as identified by user in cockpit
            brokerquery = {},   // Query as sent to the broker
            lPos = [],          // List of POS tags
            sLeftId = "stylometry-results-left",
            sCorpusId = "";     // Identifier of corpus
    
          try {
            // Hook up event handling
            nederlab.stylometry.addEventHandlers({userinfo: userinfo});
            
            // Indicate we are starting up...
            if (!$("#"+sLeftId).is(".hidden"))
              $("#"+sLeftId).addClass("hidden");
            private_methods.showMessage("Stylometrie start op...");

            // Validation
            if (queries === undefined || !queries.hasOwnProperty("formquery") || 
               !queries.hasOwnProperty("brokerquery")) {
              private_methods.showMessage("Queries zijn niet (of niet volledig) gedefinieerd");
            }

            // Store the $zoekterm for future use and show it properly
            private_methods.storeZoekterm($("#stylometry-crp-zoekterm").text(), true);
            private_methods.showZoekterm();

            // Keep the 'queries' value
            loc_queries = queries;
            // Take over the information from the hiddenquery
            formquery = queries.formquery;
            brokerquery = queries.brokerquery;

            // And store it locally
            loc_qParams['brokerquery'] = $.extend(true, {}, brokerquery);
           
            // Fill any select boxes
            if (private_methods.doInit()) {
              // Set parameters
              if (private_methods.setStyloParams(formquery)) {
                // Show that we have initialized
                private_methods.showMessage("Geinitialiseerd");
                $("#"+sLeftId).removeClass("hidden");

                // Show the explanation
                private_methods.showHelp("intro");
                private_methods.showMessage("");   
                
                // Show the corpus description
                private_methods.showCorpusInfo();
              }
            }

          } catch (err) {
            private_methods.showMessage("Fout in [init]: " + err.message);
            return false;
          }
        },
        /**
         * doPage
         *    Provide a paginated view startin from this page
         * 
         * @param {type} el
         * @returns {undefined}
         */
        doPage : function(el) {
          var elDiv = null,   // The div above me
              sDivId,         // ID of the div above me
              sListviewType = "",  
              options = {},
              sSortDir = "",
              sPage = "",     // Page as string
              iPage;          // Page to be shown
          
          try {
            // Validate
            if (el===undefined || el === null) return;
            // Get the div and then its id
            elDiv = $(el).closest('div');
            if (elDiv !== null) {
              // Get the starting page
              sPage = $(el).attr("data-page");
              iPage = Math.max(0,parseInt(sPage, 10)-1);
              // Try to find out what the listview type is
              sDivId = $(elDiv).attr("id");
              if (sDivId.indexOf("stylo-text")>=0) {
                sListviewType = "corpus";
              } else if (sDivId.indexOf("stylo-freq")>=0) {
                sListviewType = "frequencies";
              }
              // Show a loading symbol
              $("#stylometry-loading").removeClass("hidden");
              // Create an options object
              options['start'] = iPage * loc_iPageSize;
              options['listviewtype'] = sListviewType;
              // Take over sort options
              if (loc_sSortType !== "") {
                options['sorttype'] = loc_sSortType;
                // Get the sort direction
                switch(loc_sSortType) {
                  case "freq": sSortDir = loc_sSortFreq; break;
                  case "title": sSortDir = loc_sSortTitle; break;
                  case "author": sSortDir = loc_sSortAuthor; break;
                  case "year": sSortDir = loc_sSortYear; break;
                  case "word": sSortDir = loc_sSortWord; break;
                }
                options['sortdir'] = sSortDir;
              }              
              // Call the appropriate function
              nederlab.stylometry.listviewadapt(options);
            }
            
            
          } catch (err) {
            private_methods.showMessage("Fout in [doPage]: " + err.message);
          }
        },
        /**
         * export
         *    Allow exporting the results for the user in [sType] format
         * 
         * @param {string} sType  - Right now: 'csv'
         * @returns {void}
         */
        export : function(sType) {
          try {
            // Validate
            if (sType === undefined) { sType = "csv"; }
            // Call the correct function
            switch (sType) {
              case "freq-csv": // Download CSV data
                private_methods.downloadCsvData({userinfo: userinfo, type: loc_sOutType});
                break;
              case "pca-csv": // Download CSV data
                private_methods.downloadCsvData({userinfo: userinfo, type: "stylo-pca"});
                break;
              case "pca-svg": // Download the PCA image as "SVG"
                private_methods.downloadImage({userinfo: userinfo, type: "stylo-pca"});
                break;
            }
          } catch (err) {
            private_methods.showMessage("Fout in [export]: " + err.message);
          }
        },
        /**
         * listviewadapt - provide an adapted listview
         *                 Adaptation can be: page, sort direction and so forth
         * 
         * @param {object} options
         * @returns {void}
         */
        listviewadapt : function(options) {
          var sSortDir = "asc", // Search direction
              el = null,        // Element we start from
              oArgs = {},       // Arguments to be passed on
              iStart = 0;       // Starting element number (not page) 
          
          try {
            // Validate
            if (!options.hasOwnProperty("listviewtype")) return;
            // Retrieve options
            if (options.hasOwnProperty("sortdir")) {sSortDir = options['sortdir'];}
            if (options.hasOwnProperty("start")) {iStart = options['start']; }
            if (options.hasOwnProperty("el")) {el = options['el']; }
            // Initially RESET sorting
            loc_sSortType = "";
            // Make sure the 'loading'is shown
            $("#stylometry-loading").removeClass("hidden");
            // Action depends on the listview type
            switch(options['listviewtype']) {
              case "frequencies":
                // Show waiting symbol
                $("#loading-small-1").attr("style", "");
                if (options.hasOwnProperty("sorttype")) {
                  loc_sSortType = options['sorttype'];
                  switch(options['sorttype']) {
                    case "word":    // listfrequencies
                      loc_sSortWord = sSortDir;
                      break;
                    case "freq":    // listfrequencies
                      loc_sSortFreq = sSortDir;
                      break;
                  }
                  // Change the up and down arrows
                  private_methods.showSearchOrder(loc_sSortType);
                }
                // Fetch sorted results
                break;
              case "corpus":
                // Show waiting symbol
                $("#loading-small-2").attr("style", "");
                if (options.hasOwnProperty("sorttype")) {
                  loc_sSortType = options['sorttype'];
                  switch(options['sorttype']) {
                    case "author":  // listcorpus
                      loc_sSortAuthor = sSortDir;
                      break;
                    case "title":   // listcorpus
                      loc_sSortTitle = sSortDir;
                      break;
                    case "year":   // listcorpus
                      loc_sSortYear = sSortDir;
                      break;
                  }
                  oArgs['sorttype'] = loc_sSortType;
                  oArgs['sortdir'] = sSortDir;
                  // Change the up and down arrows
                  private_methods.showSearchOrder(loc_sSortType);
                }
                oArgs['adapt'] = true;
                // Fetch sorted results
                nederlab.stylometry.listcorpus(loc_qParams, iStart, oArgs);
                break;
            }
            
            // Hide the loading symbol
            $("#stylometry-loading").addClass("hidden");
           
            // Return positively
            return true;
          } catch (err) {
            private_methods.showMessage("Fout in [listviewadapt]: " + err.message);
            return false;
          }
        },
        /**
         * listcorpus
         *    Gather and present information about the corpus that is being used
         *    The information must appear in a table and consists of:
         *    - Author
         *    - Publication year
         *    - Text title
         * 
         * @param {dict} queryparams
         * @param {int}  iStart      (zero-based list-index of first item to be shown)
         * @param {object} options   
         * @returns {undefined}
         */
        listcorpus : function(queryparams, iStart, options) {
          var sOutputType = "corpus",
              sSortType = "",
              sSortDir = "",
              bAdapt = false,   //   indicating we are just adapting
              bAdapting = false;
          
          try {
            // Show that we have initialized
            // private_methods.showMessage("Tekstgegevens opzoeken...");
            
            // Look for options
            if (options !== undefined) {
              if (options.hasOwnProperty("adapt")) bAdapt = options['adapt'];
              if (options.hasOwnProperty("sorttype")) sSortType = options['sorttype'];
              if (options.hasOwnProperty("sortdir")) sSortDir = options['sortdir'];
            }
            // Look for adaptation
            if (bAdapt !== undefined && bAdapt) {bAdapting = true;}
            
            if (!bAdapting) {
              // Hide all the output options initially
              private_methods.hideAllOutput();
              private_methods.hideHitNumber();
              // Hide the stylo summary, which is not needed for document showing
              private_methods.hideStyloSummary();
            }
            
            // Action depends on the sorttype
            switch (sSortType) {
              case "author":
                // We get here, and the author information should already be present
                if (loc_lAuthorInfo.length >0) {
                  
                  // Create and show pagination buttons for the text listview
                  private_methods.showPaginationTextListview(iStart, loc_lAuthorInfo.length);
                  
                  // List the authors for this particular page 
                  private_methods.showTextListview(sSortType, iStart, sSortDir);

                  // Show that we have initialized
                  private_methods.showMessage("");
                } else {
                  // Make sure the 'loading'is not shown
                  $("#stylometry-loading").addClass("hidden");
                }
                break;
              case "title":
                break;
              default:
                // Start the actual search
                if (private_methods.searchTexts(queryparams, iStart, options)) {

                  if (!bAdapting) {
                    // Show the collocation parameters again
                    private_methods.setStyloParams(queryparams);

                    // Show the number of hits, and exclude an export button
                    private_methods.showHitNumber({"exportcsv": false});

                  }

                  // Create and show pagination buttons for the text listview
                  private_methods.showPaginationTextListview(iStart, loc_iDocTotal);

                  // List the texts for this particular page 
                  private_methods.showTextListview(sSortType, iStart, sSortDir);

                  // Show that we have initialized
                  private_methods.showMessage("");
                } else {
                  // Make sure the 'loading'is not shown
                  $("#stylometry-loading").addClass("hidden");
                }            
                break;
            }

            
          } catch (err) {
            private_methods.showMessage("Fout in [listcorpus]: " + err.message);
          }
        },
        /**
         * listfrequencies
         *    Calculate MFW frequencies for the documents and then show
         *    these frequencies in a list
         * 
         * @param {dict} queryparams
         * @param {int}  iStart      (zero-based list-index of first item to be shown)
         * @param {bool} bAdapt      optional boolean indicating we are just adapting
         * @returns {void}
         */
        listfrequencies : function(queryparams, iStart, bAdapt) {
          var sOutputType = 'freq',
              lOption = ["use_mtas_termvector", "use_mtas_group"],
              iOption = 1,
              searchStyloFunction = null;

          try {
            // Show that we have initialized
            private_methods.showMessage("Het verzamelen van frequenties begint...");
            
            // Hide all the output options initially
            private_methods.hideAllOutput();
            private_methods.hideHitNumber();
            
            // Find out which function to use
            switch (lOption[iOption]) {
              case "use_mtas_termvector":
                searchStyloFunction = private_methods.searchStyloF;
                break;
              case "use_mtas_group":
                searchStyloFunction = private_methods.searchStyloG;
                break;
            }

            // Start the actual search
            if (searchStyloFunction(queryparams)) {

              // Show the number of hits, and include an export button
              private_methods.showHitNumber({"exportcsv": true});

              // Provide a lay-men's summary of this collocation search
              private_methods.showStyloSummary({outputtype: sOutputType});
              
              // Show the collocation parameters again
              private_methods.setStyloParams(queryparams);

              // Show the corpus description
              private_methods.showStylometryInfo();
              
              // Show that we have initialized
              private_methods.showMessage("");
            } else {
              // Make sure the 'loading'is not shown
              $("#stylometry-loading").addClass("hidden");
            }            
          } catch (err) {
            private_methods.showMessage("Fout in [listfrequencies]: " + err.message);
          }
        },
        processCsvDownload : function(oData, sType) {
          private_methods.collectionCsvDownload(oData, sType);          
        },
        processSvgDownload : function(sData, sType) {
          private_methods.collectionSvgDownload(sData, sType);          
        },
        /**
         * reset
         *    Reset the currently selected collocation definition
         * 
         * @returns {void}
         */
        reset : function() {
          try {
            // Clear stylometry parameters

            // Clear stylometry summary
            $("#stylometry-summary").addClass("hidden");
            // Hide previous stylometry results
            $("#stylometry-result-info").addClass("hidden");
            $("#stylometry-vis-choices").addClass("hidden");
            // Hide the query
            $("#stylometry-corpus-query").addClass("hidden");
            // Hide nstylo messages
            $("#stylometry-nstylo-msg").addClass("hidden");
            
            nederlab.stylometry.init(loc_queries);
          } catch (err) {
            private_methods.showMessage("Fout in [reset]: " + err.message);
            return false;
          }
        },
        /**
         * resultsort
         *    Trigger a new search with the indicated parameters
         * 
         * @param {dom} el
         * @param {string} sListviewtype
         * @param {string} sSortType      - author, name, year
         * @param {string} sSortDirection - 'asc', 'desc', ''
         * @returns {void}
         */
        resultsort : function(el, sListviewtype, sSortType, sSortDirection) {
          try {
            // Pass on the correct parameters
            nederlab.stylometry.listviewadapt({
              "el": el,
              "start": 0,
              "listviewtype": sListviewtype, 
              "sorttype": sSortType, 
              "sortdir": sSortDirection});
          } catch (err) {
            private_methods.showMessage("Fout in [resultsort]: " + err.message);
          }
        },
        /**
         * selectTask
         *    Find out which task needs to be done, and then start it
         *    This function is attached to the "taak uitvoeren" button
         *       under the "taakomschrijving"
         * 
         * @param {string} sOptionalTask  - may be empty
         * @returns {void}
         */
        selectTask : function(sOptionalTask) {
          var queryparams = {},   // Dictionary with parameters
              sTask = "",
              options = {},
              oData = {};
          
          try {
            // Make sure a possible previous search is abandoned
            private_methods.stopAjaxCall();
            // Copy the <form> parameters to the 'queryparams' variable
            queryparams = private_methods.getParameters();
            // Take over the [brokerquery] into the parameters
            queryparams['brokerquery'] = $.extend(true, {}, loc_qParams['brokerquery']);
            // And store the result locally again
            loc_qParams = JSON.parse(JSON.stringify(queryparams));
            
            // Hide the explanation and the summary
            private_methods.hideHelp();
            private_methods.hideStyloSummary();
            
            // Clear any existing visualisation(s)
            $("#stylo-visualisatie div").empty();
            $("#stylo-visualisatie2").addClass("hidden");
            $("#stylo-visualisatie3").addClass("hidden");
            
            // Find out which task is selected
            if (sOptionalTask === undefined) {
              sTask = $("#stylo-task-sel").val();
            } else {
              sTask = sOptionalTask;
            }
            switch(sTask) {
              case "corpus":
                // Get information on the number of documents
                private_methods.showMessage("Aantal documenten bepalen");
                private_methods.getStatInfo(queryparams);
                $("#stylometry-vis-choices").addClass("hidden");
                // Check the results for the max we can process
                if (private_methods.canHandleAmount(loc_iDocTotal)) {
                  // Calculate total number of pages
                  loc_iPageNum = Math.ceil(loc_iDocTotal / loc_iPageSize);
                  // Reset parameters
                  loc_sSortType = "author"; loc_sSortAuthor = "asc"; loc_sSortTitle = "asc";
                  loc_sSortYear = "asc";
                  if (!loc_bCorpusDone) {
                    // Get the author information
                    private_methods.showMessage("Auteursinformatie ophalen");
                    private_methods.getAuthorInfo(queryparams);
                  }
                  // Hide all previous output windows
                  private_methods.hideAllOutput();
                  // Show the first page
                  nederlab.stylometry.listcorpus(queryparams, 0);
                }
                break;
              case "mfw":
                // Hide all previous output windows
                private_methods.hideAllOutput();
                // Show that we have initialized
                private_methods.showMessage("");
                // Show the MFW that has been found
                private_methods.showStylometryInfo();
                // Hide the visualisation buttons
                $("#stylometry-vis-choices").addClass("hidden");
                
                break;
              case "freq":
                // Get information on the number of documents
                private_methods.showMessage("Aantal documenten bepalen");
                private_methods.getStatInfo(queryparams);
                // Initialisations
                loc_lResultFreq = [];
                // Hide the visualisation buttons
                $("#stylometry-vis-choices").addClass("hidden");
                // Check the results for the max we can process
                if (private_methods.canHandleAmount(loc_iDocTotal)) {
                  // Reset parameters
                  loc_sSortType = "freq"; loc_sSortFreq = "desc"; loc_sSortWord = "asc";
                  if (!loc_bCorpusDone) {
                    // Get the author information
                    private_methods.showMessage("Auteursinformatie ophalen");
                    private_methods.getAuthorInfo(queryparams);
                  }
                  // Hide all previous output windows
                  private_methods.hideAllOutput();
                  // Show the first page
                  nederlab.stylometry.listfrequencies(queryparams, 0);
                  
                  // Since the frequencies have been determined, now show
                  //   the other buttons to the user
                  $("#stylo-task").removeClass("hidden");
                  $("#stylometry-controls").removeClass("hidden");
                }
                break;
              case "st-ana":  // Principle Components Analysis
              case "st-ana-loc":  // Principle Components Analysis
                // Hide the Clustar Analysis buttons
                $("#stylometry-vis-choices").addClass("hidden");
                // Convert the available data into a table
                oData = private_methods.getOutputResultsObject("alldocs");
                if (oData === null || !oData) {
                  // Warn the user
                  private_methods.showMessage("Fout: eerst frequenties bepalen");
                } else {
                  // Show we are progressing
                  private_methods.showMessage("Een 'Principle Components Analysis' met 'Nstylo'...");
                  options['production'] = (sTask === "st-ana");
                  options['distancemethod'] = "Classic Delta distance";
                  // Hide all previous output windows
                  private_methods.hideAllOutput();
                  // Send the data as JSON to the Nstylo service
                  private_methods.doPcaThroughNstylo(oData, options);
                  // Make sure export button is shown
                  private_methods.showHitNumber({"exportcsv": true});
                }
                break;
              case "st-clus":       // Cluster analysis
              case "st-clus-loc": // Cluster analysis on the local machine
                // Convert the available data into a table
                oData = private_methods.getOutputResultsObject("alldocs");
                if (oData === null || !oData) {
                  // Warn the user
                  private_methods.showMessage("Fout: eerst frequenties bepalen");
                } else {
                  // Show we are progressing
                  private_methods.showMessage("Een 'Principle Components Analysis' met 'Nstylo'...");
                  options['production'] = (sTask === "st-clus");
                  options['distancemethod'] = "Classic Delta distance";
                  // Hide all previous output windows
                  private_methods.hideAllOutput();
                  // Send the data as JSON to the Nstylo service
                  private_methods.doCaThroughNstylo(oData, options);
                  // Make sure export button is shown
                  private_methods.showHitNumber({"exportcsv": true});
                  // Show the CA visualisation choices
                  $("#stylometry-vis-choices").removeClass("hidden");
                }
                break;
            }
          } catch (err) {
            private_methods.showMessage("Fout in [selectTask]: " + err.message);
          }
        },
        
        /**
         * svgResize 
         *    Resize one or more SVG elements using their calculated width and aspect
         *    ratio, as cacluated from their viewBox attribute. This assumes that
         *    elements have a variable width. Variable height SVG elements would set the
         *    "width" style to `Math.ceil(rect.height * d.aspect) + "px"`
         * @param {type} selection
         * @returns {undefined}
         */
        svgResize : function(selection) {
          selection.style("height", function(d) {
            this.style.height = "auto";
            var rect = this.getBoundingClientRect(),
                height = rect.width / d.aspect;
            return isFinite(height)
              ? Math.ceil(height) + "px"
              : null;
          });        
        },
        /**
         * toggleDocInfo
         *    Show or hide the information of this document
         * 
         * @param {type} el
         * @returns {undefined}
         */
        toggleDocInfo : function(el) {
          var elNextR = null;
          
          try {
            // Get the next row
            elNextR = $(el).closest("tr").next();
            if (elNextR !== undefined) {
              // Is it hidden or not?
              if ($(elNextR).hasClass("hidden")) {
                // Hide all others
                $(elNextR).closest("table").find(".docinfo").addClass("hidden");
                // Show it
                $(elNextR).removeClass("hidden");
              } else {
                // Hide it
                $(elNextR).addClass("hidden");
              }
            }            
          } catch (err) {
            private_methods.showMessage("Fout in [toggleDocInfo]: " + err.message);
          }
        },
        toggleShowRequest : function() {
          private_methods.toggleShowGeneral("zoekvraag", "Verberg zoekvraag",
          "#stylometry-corpus-query","#stylometry-corpus-query-show");
        },
        toggleShowNstylo : function() {
          private_methods.toggleShowGeneral("nstylo", "Verberg nstylo",
          "#stylometry-nstylo-msg","#stylometry-nstylo-msg-show");
        }
        
      };
    };
    
    // Activate collocation 'view'
    $.each(stylometry($, nederlab.config), function (k,v) {
      nederlab.stylometry[k] = v;
    });

    return nederlab;

  }(jQuery, window.nederlab || {})); // window.nederlab: zie http://stackoverflow.com/questions/21507964/jslint-out-of-scope
    