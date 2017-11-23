var django = {
  "jQuery": jQuery.noConflict(true)
};
var jQuery = django.jQuery;
var $ = jQuery;


var ru = (function ($, ru) {
  "use strict";

  ru.nstylo = (function ($, config) {
    // Define variables for ru.collbank here
    var loc_example = "",
        loc_divErr = "sentdetails_err",
        oSyncTimer = null;


    // Private methods specification
    var private_methods = {
      /**
       * methodNotVisibleFromOutside - example of a private method
       * @returns {String}
       */
      methodNotVisibleFromOutside: function () {
        return "something";
      },
      errMsg: function (sMsg, ex) {
        var sHtml = "Error in [" + sMsg + "]<br>" + ex.message;
        $("#" + loc_divErr).html(sHtml);
      },
      disable: function (element) {
          element = $(element);
          element.disabled = true;
          return element;
      },

      enable: function (element) {
          element = $(element);
          element.removeAttr("disabled");
          // element.disabled = false;
          return element;
      }

    }

    // Public methods
    return {

      /**
       *  addGraph
       *      Add a graph at sLocation
       *
       */
      addGraph: function (sLocation) {
        var chart = null,
            svg = null;

        try {
          // Find out what the location is
          svg = $("#" + sLocation).find("svg");

          chart = nv.models.discreteBarChart()
        } catch (ex) {
          private_methods.errMsg("addGraph", ex);
        }
      },

      /**
       *  gettabledata
       *      Get JSON table data by calling the URL
       *
       */
      gettabledata: function (sUrl) {
        var result = null;

        $.post(sUrl, function (data) {
          result = data;
        });

        // Return what we found
        return result;
      },

      selectSite: function () {
        var sDivSeries = "#id_series",
            sDivSite = "#id_site",
            sDivPlot = "#plot_div",
            sDivDeath = "#div_of_death";

        if ($(sDivSeries).val() == '') {
            $(sDivDeath).html("");
            $(sDivSite).html("");
            private_methods.disable(sDivSite);
            $(sDivPlot).html("");
            return;
        }
        $(sDivSite).html("");
        private_methods.disable(sDivSite);
        $(sDivPlot).html("");
        new Ajax.Request('getSites', {
            method:"get",
            parameters: "value=" + $(sDivSeries).val(),
            onSuccess: function(response) {
                $(sDivDeath).html("");
                $(sDivSite).html(response.responseText);
                private_methods.enable(sDivSite);
            },
            onFailure: function(response) {
                $(sDivDeath).html(response.responseText);
            }
        });
      },

      doJobby : function() {
        var sDivSeries = "#id_series",
            sDivSite = "#id_site",
            sDivPlot = "#plot_div",
            sDivDeath = "#div_of_death";

        if ($(sDivSite).value == '') {
            $(sDivPlot).html("");
            return;
        }            
        new Ajax.Request('doFDC', {
            method:"get",
            parameters: "value=" + $(sDivSite).val(),
            onSuccess: function(response) {
                $(sDivDeath).html("");
                $(sDivPlot).html(response.responseText);
            },
            onFailure: function(response) {
                $(sDivDeath).html(response.responseText);
                $(sDivPlot).html("");
            }
        });
      },



      /**
       *  showtabledata
       *      Get data from [sUrl] and show it in location [sDiv]
       *
       */
      showtabledata: function (sUrl, sDiv) {
        var svg = null,
            result = null,  // 
            oTable = null,  // Just the table
            oThat = null;

        try {
          // Find out where to put it
          svg = d3.select(sDiv)
                  .append("svg")
                  .attr("width", 300)
                  .attr("height", 200)
                  .attr("transform", "translate(100,300)");
          // Make a POST call to get the data
          $.post(sUrl, function (oFreqData) {
            // Get the table from here
            oTable = oFreqData['table'];
            // Show the table
            svg.selectAll("circle")
              .data(oTable)
              .enter()
              .append("circle")
              .attr("cx", 4)
              .attr("cy", 2)
              .attr("r", 5);
            // We now have the data: show it
            result = oFreqData;
          });
          // Function doesn't return anything
        } catch (ex) {
          private_methods.errMsg("showtabledata", ex);
        }
      },

      /**
       *  ftableshow
       *      Show the definition of a frequency table
       *
       */
      ftableshow: function (el) {
        var elTr = null;

        try {
          // Get to the nearest <tr>
          elTr = $(el).closest("tr");
          // Get to the next row
          elTr = $(elTr).next(".ftable-details");
          // Check its status
          if ($(elTr).hasClass("hidden")) {
            // Hide all other [function-details]
            $(elTr).closest("table").find(".ftable-details").addClass("hidden");
            // It's hidden, so open it
            $(elTr).removeClass("hidden");
          } else {
            // It's open, so close it
            $(elTr).addClass("hidden");
          }


        } catch (ex) {
          private_methods.errMsg("ftableshow", ex);
        }
      },



      /**
       *  part_detail_toggle
       *      Toggle part detail
       *
       */
      part_detail_toggle: function (iPk) {
        var sId = "";

        // validate
        if (iPk === undefined) return;
        // Get the name of the tag
        sId = "#part_details_" + iPk.toString();
        // Check if it is visible or not
        if ($(sId).hasClass("hidden")) {
          // Remove it
          $(sId).removeClass("hidden");
        } else {
          // Add it
          $(sId).addClass("hidden");
        }
      }

    };
  }($, ru.config));

  return ru;
}(jQuery, window.ru || {})); // window.ru: see http://stackoverflow.com/questions/21507964/jslint-out-of-scope

