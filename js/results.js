/**
 * Display available election results and download links.
 */
(function(window, document, $, _, Backbone, d3, openelex) {
  window.openelex = openelex;

  var REPORTING_LEVELS = ['county', 'precinct', 'state_legislative', 'congressional_district'];

  var OFFICES = [
    ['any', "Any Office"],
    ['prez', "President"],
    ['senate', "U.S. Senate"],
    ['house', "U.S. House"],
    ['gov', "Governor"],
    ['state_officers', "State Officers"],
    ['state_leg', "State Legislature"]
  ];

  var RACE_TYPES = [
    ['any', "Any Race Type"],
    ['primary', "Primary"],
    ['special_primary', "Special Primary"],
    ['general', "General"],
    ['special_general', "Special General"],
    ['runoff', "Run-off"]
  ];

  var RACE_TYPE_LABELS = _.object(RACE_TYPES);

  // Global events.
  //
  // These are triggered over the Backbone object, used as a global event
  // bus.

  /**
   * @event state
   *
   * Triggered when a U.S. state is selected.
   *
   * @param {string} state - State abbreviation.  For example, "md".
   */

  /**
   * @event filter:office
   *
   * Triggered when an office is selected.
   *
   * @param {string} office - Office slug.
   */

  // Utility functions

  function toTitleCase(str) {
    return str.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
  }

  /**
   * If a string is non-empty, add a space after it.
   *
   * This is useful when concatenating strings where bit might be empty.
   */
  function addSpace(str, suffix) {
    suffix = suffix || ' ';
    return str ? str + suffix : str;
  }

  /**
   * Naive pluralization function.
   */
  function pluralize(s, count) {
    if (count === 1) {
      return s;
    }

    return s + 's';
  }

  // Routers

  var ResultsRouter = Backbone.Router.extend({
    routes: {
      ":state": "stateResults"
    },

    /**
     * Route handler for an individual state.
     *
     * @fires state
     */
    stateResults: function(state) {
      Backbone.trigger('state', state);
    }
  });

  // Models

  /**
   * Describes an election and available election results.
   */
  var Election = Backbone.Model.extend({
     reportingLevelUrl: function(level, raw) {
       var attr = raw ? 'results_raw' : 'results';
       return this.get(attr)[level];
     },

     raceLabel: function() {
       var label = "";
       var raceTypeBits = this.get('race_type').split('-');
       if (this.isSpecial()) {
         label += "Special ";
       }
       label += toTitleCase(raceTypeBits[0]);
       if (this.isRunoff()) {
         label += " Runoff";
       }
       return label;
     },

     isSpecial: function() {
       return this.get('special');
     },

     isRunoff: function() {
       var raceTypeBits = this.get('race_type').split('-');
       return (raceTypeBits.length > 1 && raceTypeBits[1] === "runoff");
     },

     normalizedRaceType: function() {
       var raceType;

       if (this.isRunoff()) {
         return 'runoff';
       }

       raceType = this.get('race_type');

       if (this.isSpecial()) {
         raceType = 'special_' + raceType;
       }

       return raceType;
     }
  });

  // Collections

  var Elections = Backbone.Collection.extend({
    model: Election,

    initialize: function(models, options) {
      options = options || {};

      this.comparator = options.comparator || 'start_date';
      this._initInternal();
      if (models) {
        _.each(models, this.addDates, this);
      }

      this._dataRoot = options.dataRoot;
      this.on('add', this.addDates, this);
    },

    _initInternal: function() {
      this._years = {};
      this._yearList = null; 
      this._dates = {};
    },

    url: function() {
      return this._dataRoot + '/elections-' + this._state + '.json';
    },

    setState: function(state) {
      this._state = state;
      this._initInternal();
      return this;
    },

    addDates: function(model) {
      this._years[model.get('year')] = true;
      this._dates[model.get('start_date')] = true;
      this._yearList = null;
    },

    years: function() {
      if (this._yearList === null) {
        this._yearList = _.map(_.keys(this._years).sort().reverse(), function(yearS) {
          return parseInt(yearS);
        });
      }
      
      return this._yearList;
    },

    dates: function() {
      return _.keys(this._dates).sort();
    },

    filterElections: function(filterArgs) {
      var office = filterArgs.office;
      var dateStart = filterArgs.dateStart.length === 4 ? filterArgs.dateStart + '-01-01' : filterArgs.dateStart;
      var dateEnd = filterArgs.dateEnd.length === 4 ? filterArgs.dateEnd + '-12-31' : filterArgs.dateEnd;
      var raceType = this._parseRaceType(filterArgs.raceType);
      var models = this.filter(function(model) {
        var officeMatches = true;
        var dateMatches = true;
        var raceTypeMatches = true;

        if (office) {
          officeMatches = office === 'any' || model.get(office) === true;
        }

        if (dateStart && dateEnd) {
          dateMatches = (model.get('start_date') >= dateStart &&
            model.get('start_date') <= dateEnd);
        }

        if (raceType && raceType.raceType !== 'any') {
          if (raceType.raceType === 'runoff') {
            raceTypeMatches = model.isRunoff();
          }
          else {
            raceTypeMatches = model.get('race_type') === raceType.raceType;
          }

          if (raceType.special) {
            raceTypeMatches = raceTypeMatches && model.isSpecial();
          }
        }

        return officeMatches && dateMatches && raceTypeMatches;
      });
      var filtered = new Elections(models, {
        state: this._state,
        dataRoot: this._dataRoot,
      });
      this.trigger('filter', filtered);
      return filtered;
    },

    /**
     * Parse the race type string from the front end into an object we can
     * use to filter models.
     *
     * This is needed because the way race types are presented on the front
     * end is flattened from how they are stored in the models.
     */
    _parseRaceType: function(raceType) {
      var filters, raceTypeBits;

      if (_.isUndefined(raceType)) {
        return null;
      }
     
      filters = {};
      raceTypeBits = raceType.split('_');

      if (raceTypeBits[0] === "special") {
        filters.special = true;
        filters.raceType = raceTypeBits[1];
      }
      else {
        filters.raceType = raceTypeBits[0];
      }

      return filters;
    },

    /**
     * Get a list of result summaries, with one entry per year, ordered by year.
     */
    yearSummary: function() {
      var summaries = {};
      var summaryList = [];
      var prevYear;
      var yearEntry;
      var years = this.years();
      var start = _.last(years);
      var end = years[0];
      var year;

      this.each(function(election) {
        year = election.get('year');

        if (prevYear !== year) {
          if (yearEntry) {
            summaries[prevYear] = yearEntry;
          }

          yearEntry = this._initialSummaryEntry(year);
          prevYear = year;
        }

        yearEntry = this._incSummaryEntry(yearEntry, election.normalizedRaceType());
      }, this);

      summaries[year] = yearEntry;

      _.each(_.range(start, end + 1), function(year) {
        summaryList.push(summaries[year] || this._initialSummaryEntry(year));
      }, this);

      return summaryList; 
    },

    _initialSummaryEntry: function(year) {
      return {
        year: year,
        runoff: 0,
        general: 0,
        special_general: 0,
        primary: 0,
        special_primary: 0
      };
    },

    _incSummaryEntry: function(o, prop) {
      var newO = _.clone(o);
      newO[prop] = newO[prop] || 0;
      newO[prop] += 1;
      return newO;
    }
  });

  // Views
  
  var ResultsHeadingView = Backbone.View.extend({
    tagName: 'h3',

    attributes: {
      class: 'results-heading'
    },

    options: {
      // A map of office slugs, as defined in the JSON and the dashboard
      // to labels that will be seen by the user
      officeLabels: _.extend(_.object(OFFICES), {
        any: "",
        prez: "Presidential",
        gov: "Gubenatorial",
        state_offices: "State Officer"
      }),

      raceTypeLabels: _.extend({}, RACE_TYPE_LABELS, {
        any: ""
      })
    },

    initialize: function(options) {
      _.extend(this.options, options);

      this.collection.on('sync', this.handleSync, this);
      Backbone.on('filter:office', this.filterOffice, this);
      Backbone.on('filter:dates', this.filterDates, this);
      Backbone.on('filter:race_type', this.filterRaceType, this);

      this.renderInitial();
    },

    renderInitial: function() {
      this.$el.text("All Races");
      return this;
    },

    handleSync: function() {
      this._filterArgs = {
        office: 'any',
        raceType: 'any'
      };
      return this.render();
    },

    render: function() {
      var prefix, raceTypeLabel, officeLabel, startYear, endYear;

      // No filtering has been done yet, we need to get the date range from
      // the collection.
      if (!(this._filterArgs.dateStart && this._filterArgs.dateEnd)) {
        _.extend(this._filterArgs, this._getInitialDates());
      }

      raceTypeLabel = addSpace(this.options.raceTypeLabels[this._filterArgs.raceType]);
      officeLabel = addSpace(this.options.officeLabels[this._filterArgs.office]);
      prefix = raceTypeLabel && officeLabel ? "" : "All "; 
      startYear = this._filterArgs.dateStart;
      endYear = this._filterArgs.dateEnd;

      this.$el.text(raceTypeLabel + officeLabel + "Races " + startYear + " - " + endYear);

      return this;
    },

    _getInitialDates: function() {
      return {
        dateStart: this.collection.first().get('start_date').slice(0, 4), 
        dateEnd: this.collection.last().get('start_date').slice(0, 4) 
      };
    },

    filterOffice: function(office) {
      this._filterArgs = _.extend(this._filterArgs, {
        office: office
      });
      return this.render();
    },

    filterDates: function(dateStart, dateEnd) {
      this._filterArgs = _.extend(this._filterArgs, {
        dateStart: dateStart,
        dateEnd: dateEnd
      });
      return this.render();
    },

    filterRaceType: function(raceType) {
      this._filterArgs = _.extend(this._filterArgs, {
        raceType: raceType
      });
      return this.render();
    }
  });

  var ResultsTableView = Backbone.View.extend({
    tagName: 'table',

    attributes: {
      class: 'table'
    },

    options: {
      headerRows: [
        ["Date", "Race", "Results", "", "", ""],
        ["", "", "County", "Precinct", "State Legislative", "Congressional District"]
      ],
    },

    events: {
      "click th.year-heading": 'handleClickYear'
    },

    initialize: function(options) {
      this._filterArgs = {};
      this.renderInitial();

      this.collection.on('sync', this.handleSync, this);
      Backbone.on('filter:office', this.filterOffice, this);
      Backbone.on('filter:dates', this.filterDates, this);
      Backbone.on('filter:race_type', this.filterRaceType, this);
    },

    handleSync: function() {
      this._filterArgs = {};
      this.filteredCollection = this.collection;
      return this.render();
    },

    render: function() {
      var years = this.filteredCollection.years();
      this._$tbody.empty();
      _.each(years, function(year) {
        var elections = this.filteredCollection.where({year: year}).reverse();

        this._$tbody.append(this.renderYearHeading(year));

        _.each(elections, function(election) {
          this._$tbody.append(this.renderElectionRow(year, election));
        }, this);
      }, this);

      this.expandYear(years[0]);

      return this;
    },

    renderYearHeading: function(year) {
      var $tr = $('<tr class="year-heading">');

      $('<th colspan="6" class="year-heading" data-year="' + year + '">' + year + '</th>').appendTo($tr);

      return $tr;
    },

    renderElectionRow: function(year, election) {
      var $tr = $('<tr class="election" data-year="' + year + '">').appendTo(this._$tbody);
      $tr.append($('<td>' + election.get('start_date') + '</td>'));
      $tr.append($('<td>' + election.raceLabel() + '</td>'));

      _.each(REPORTING_LEVELS, function(level) {
        $('<td class="download">').append(this.renderDownloadWidget(election, level))
          .appendTo($tr);
      }, this);

      return $tr;
    },

    renderDownloadWidget: function(election, level) {
      // @todo Add URLs for clean data, but we only have raw for now, so don't worry about it
      var url = election.reportingLevelUrl(level, true);

      // @todo Update this with some kind of widget to select data format.
      // For now, just return a link
      if (url) {
        return $('<a href="' + url + '" title="Download CSV"><img src="../img/icon/pink_arrow_down.png"></a>');
      }
      else if (election.get(this.statusAttr(level)) === 'yes') {
        return $('<img src="../img/icon/lt_grey_download_arrow.png">');
      }
      else {
        return null;
      }
    },

    statusAttr: function(level) {
      var lookupLevel = "" + level;

      if (lookupLevel === 'congressional_district') {
        lookupLevel = 'cong_dist';
      }
      else if (lookupLevel === 'state_legislative') {
        lookupLevel = 'state_leg';
      }

      return lookupLevel + '_level_status';
    },

    renderInitial: function() {
      var thead = $('<thead>').appendTo(this.$el);
      _.each(this.options.headerRows, function(row) {
        var tr = $('<tr>').appendTo(thead);

        _.each(row, function(col) {
          var th = $("<th>" + col + "</th>").appendTo(tr); 
        }, this);
      }, this);
      this._$tbody = $('<tbody>').appendTo(this.$el);
      return this;
    },

    handleClickYear: function(evt) {
      var $el = $(evt.target);
      var year = $el.data('year');

      if ($el.hasClass('open')) {
        this.collapseYear(year);
      }
      else {
        this.expandYear(year);
      }
    },

    expandYear: function(year) {
      this.$('th.year-heading[data-year="' + year + '"]').addClass('open');
      this._$tbody.find('tr.election[data-year="' + year + '"]').addClass('open');
    },

    collapseYear: function(year) {
      this.$('th.year-heading[data-year="' + year + '"]').removeClass('open');
      this._$tbody.find('tr.election[data-year="' + year + '"]').removeClass('open');
    },

    filterOffice: function(office) {
      this._filterArgs = _.extend(this._filterArgs, {
        office: office
      });
      return this.applyFilters();
    },

    filterDates: function(dateStart, dateEnd) {
      this._filterArgs = _.extend(this._filterArgs, {
        dateStart: dateStart,
        dateEnd: dateEnd
      });
      return this.applyFilters();
    },

    filterRaceType: function(raceType) {
      this._filterArgs = _.extend(this._filterArgs, {
        raceType: raceType
      });
      return this.applyFilters();
    },

    applyFilters: function(filters) {
      filters = filters || this._filterArgs;
      this.filteredCollection = this.collection.filterElections(filters);
      return this.render();
    }
  });

  /**
   * Visualization of elections in a year over time. 
   *
   * This should be called on a selection that is joined to data that
   * is a list of objects that look like this:
   * 
   * {
   *   general: 1,
   *   primary: 1
   *   runoff: 2
   *   special_general: 1
   *   special_primary: 0
   *   year: 2000
   * }
   *
   * That is, each data element has a year property and a property for each
   * election type whose value is the number of elections of that type in a
   * year.
   *
   * This implementation is based on the pattern described by Mike Bostock in 
   * [Towards Reusable Charts](http://bost.ocks.org/mike/chart/).
   */
  function electionsVisualization(options) {
    // Configuration

    // Private
    var height = 162;
    var margin = { top: 27, right: 0, bottom: 30, left: 0 };
    var legendWidth = 120;
    var legendMargin = { top: 0, right: 0, bottom: 0, left: 30 };
    // Maximum width of year bands.  This is needed because the number of years
    // with elections (the horizontal axis of this visualization) can vary
    // widely from state to state.  On narrower displays, the bar width will
    // be calculated as a percentage of the total width.
    var maxBandWidth = 30;
    // Space between year bars 
    var barPadding = 0.1;
    // maxBandWidth = 30 and barPadding = 0.1 will create gray bars ~27px wide
    // and spaces ~3px wide.
    // Space outside of year bars
    var barOuterPadding = 0;
    // List of election types.  These should match the properties of
    // the items in the data list.
    // The order of these types defines the vertical ordering in the
    // rendered visualization.
    var electionTypes = [
      'primary',
      'special_primary',
      'general',
      'special_general',
      'runoff'
    ];
    // Expected maximum number of special or runoff elections in a year.  
    // This is used to size the shape representing the number of elections.
    var maxSpecialElections = 4;
    // Expected maximum number of primary or general elections in a year.
    var maxRegularElections = 2;
    var specialElectionDomain = d3.range(0, maxSpecialElections + 1);
    var regularElectionDomain = d3.range(0, maxRegularElections + 1);
    // The shapes representing special elections will decrease in size by
    // this amount
    var specialElectionScaleFactor = 0.36;
    // The shapes representing regular elections will decrease in size by
    // this amount
    var regularElectionScaleFactor = 0.36;
    // Multiply this value times the width of the vertical bars to get the
    // width of the largest election shape. 
    var maxRegularElectionSizeFactor = 0.89; // 27 * .89 ~= 24
    var maxSpecialElectionSizeFactor = 0.78; // 27 * .78 ~= 21

    // Public

    // Dispatcher used to share events between views
    var dispatcher = d3.dispatch('filterdates');

    /**
     * Factory for a rendering function for the shape for type of election in
     * a year.
     *
     * The returned function has the following getter/setter methods:
     *
     * x: d3 scale function used to determine the x coordinate of the shape
     *   relative to the entire chart.
     * dim: d3 scale function used to determine the width and height of the
     *   shape.
     * electionType: the type of election.  This should correspond to a property
     *   of the data objects.  It is used to set the class of the shape.
     * onEnter: Function that will be executed for every element in the
     *   selection on entering that element.  This is where code for
     *   creating the svg element for hte shape should go.
     * calcDim: Function that returns the dimension of the shape.
     *
     */
    function renderElectionShape() {
      var x;
      var dim;
      var electionType;
      var onEnter;
      var calcDim = function(d) {
        return dim(d[electionType]);
      };
      var calcX;
      var calcY;
      var label = function(d) {
        var count = d[electionType];
        return count + " " + RACE_TYPE_LABELS[electionType].toLowerCase() + " " + pluralize("election", count); 
      };

      function render(selection) {
        selection.enter().call(onEnter);
      }

      render.calcDim = function(val) {
        if (!arguments.length) return calcDim;
        calcDim = val; 
        return render; 
      };

      render.label = function(val) {
        if (!arguments.length) return label;
        label = val; 
        return render; 
      };

      render.x = function(val) {
        if (!arguments.length) return x;
        x = val; 
        return render; 
      };

      render.y = function(val) {
        if (!arguments.length) return y;
        y = val; 
        return render; 
      };

      render.dim = function(val) {
        if (!arguments.length) return dim;
        dim = val; 
        return render; 
      };

      render.electionType = function(val) {
        if (!arguments.length) return electionType;
        electionType = val; 
        return render; 
      };

      render.onEnter = function(val) {
        if (!arguments.length) return onEnter;
        onEnter = val; 
        return render; 
      };

      render.calcX = function(val) {
        if (!arguments.length) return calcX;
        calcX = val; 
        return render; 
      };

      render.calcY = function(val) {
        if (!arguments.length) return calcY;
        calcY = val; 
        return render; 
      };

      return render;
    }

    /**
     * Factory for a rendering function that renders a square for a
     * year's election type.
     */
    function renderSquare() {
      var render = renderElectionShape()
        .calcX(function(d) {
          return render.x()(d.year) + (render.x().rangeBand() / 2) - (render.calcDim()(d) / 2);
        })
        .calcY(function(d) {
          return render.y()(render.electionType()) - (render.calcDim()(d) / 2);
        });

      render.onEnter(function(selection) {
        selection.append('rect')
          .attr('class', render.electionType().replace('_', '-'))
          .attr('x', render.calcX())
          .attr('y', render.calcY())
          .attr('width', render.calcDim())
          .attr('height', render.calcDim())
          .append('title')
            .text(function(d) { return render.label()(d); });
      });
      return render;
    }

    /**
     * Factory for a rendering function that renders a circle for a
     * year's election type.
     */
    function renderCircle() {
      var render = renderElectionShape()
        .calcX(function(d) {
          var x = render.x();
          return x(d.year) + (x.rangeBand() / 2);
        })
        .calcY(function(d) {
          return render.y()(render.electionType()); 
        });

      render.onEnter(function(selection) {
        selection.append('circle')
          .attr('class', render.electionType().replace('_', '-'))
          .attr('cx', render.calcX())
          .attr('cy', render.calcY())
          .attr('r', function(d) { return render.calcDim()(d) / 2; })
          .append('title')
            .text(function(d) { return render.label()(d); });
      });
      return render;
    }

    /**
     * Brush-based control to select a range of years.
     *
     * It should be instantiated like this:
     *
     * var slider = yearSlider()
     *   .x(x);
     *
     * And invoked on a selection like this:
     *
     * selection.call(slider);
     *
     */
    function yearSlider() {
      var sliderHandleSize = 11;
      var sliderHeight = 4;
      var brush, x, width;

      /**
       * Convert a value from the range of the x scale to the year (domain)
       * value.
       *
       * @param {Number} d x coordinate
       *
       * @returns {Number} Year from scale domain that maps to the x coordinate 
       */
      function xtoyear(d, xScale) {
        var barWidth = xScale.rangeBand();
        var w = barWidth + (barWidth * barPadding);
        var i = Math.floor(d / w);
        var domain = xScale.domain();

        if (i >= domain.length) {
          return null;
        }

        return domain[i];
      }

      function brushmove() {
        // Snapping for brush handles, based on
        // http://bl.ocks.org/mbostock/6232620
        var extent0 = brush.extent();
        var start, end, extentWidth, extent1;

        if (d3.event.mode === 'move') {
          // If dragging, preserve the width of the extent
          start = x(xtoyear(extent0[0], x));
          extentWidth = extent0[1] - extent0[0];
          end = x(xtoyear(start + extentWidth, x)) || width;
          extent1 = [start, end];
        }
        else {
          // otherwise, if resizing, round both values
          extent1 = extent0.map(function(d) {
            var yr = xtoyear(d, x);

            if (yr === null) {
              return width;
            }

            return x(yr);
          });
        }

        d3.select(this).call(brush.extent(extent1));
      }

      function brushend() {
        var extent = brush.extent();
        var years = x.domain();
        var start = xtoyear(extent[0], x);
        var end = xtoyear(extent[1], x) || years[years.length - 1];

        dispatcher.filterdates(start, end);
      }

      function control(selection) {
        brush = d3.svg.brush()
          .x(x)
          .extent([0, width])
          .on('brush', brushmove)
          .on('brushend', brushend);
        selection.call(brush);

        // Make the brush handles circles
        selection.selectAll('.resize').append('circle')
            .attr('transform', 'translate(0, ' + sliderHeight / 2 + ')')
            .attr('r', sliderHandleSize / 2);

        // Make the background visible
        selection.selectAll('.background')
            .style({'visibility': 'visible'});

        selection.selectAll('rect')
            .attr('height', sliderHeight);
      }

      control.x = function(val) {
        if (!arguments.length) return x;
        x = val;
        width = x.rangeExtent()[1];
        return control; 
      };

      return control;
    }

    function electionTypeLegend() {
      var shapeMap = {
        'primary': 'circle',
        'special_primary': 'square',
        'general': 'circle',
        'special_general': 'square',
        'runoff': 'square'
      };
      var y;
      var textPadding = 8;
      var title = "Race Types";
      // Use the first size for circles in the legend
      var circleScaleIndex = 1;
      // Use the second size for squares in the legend
      var squareScaleIndex = 2;
      var circleScale, squareScale;
      var circleSize, squareSize, maxSize;

      function renderItem(selection) {
        selection.each(function(electionType) {
          var sel = d3.select(this);
          if (shapeMap[electionType] === 'circle') {
            sel.call(renderCircle);
          }
          else if (shapeMap[electionType] === 'square') {
            sel.call(renderSquare);
          }

          sel.append('text')
            .attr('transform', 'translate(' + (maxSize + textPadding) + ',' + y(electionType) + ')')
            .attr('dy', '0.25em')
            .text(RACE_TYPE_LABELS[electionType]);
        });
      }

      function renderSquare(selection) {
        selection.append('rect')
          .attr('class', function(d) { return d.replace('_', '-'); })
          .attr('x', (maxSize - squareSize) / 2)
          .attr('y', function(d) { return y(d) - (squareSize / 2); })
          .attr('width', squareSize)
          .attr('height', squareSize);
      }

      function renderCircle(selection) {
        selection.append('circle')
          .attr('class', function(d) { return d.replace('_', '-'); })
          .attr('cx', circleSize / 2)
          .attr('cy', function(d) { return y(d); })
          .attr('r', circleSize / 2);
      }

      function render(selection) {
        selection.each(function() {
          var sel = d3.select(this);
          squareSize = squareScale(squareScaleIndex);
          circleSize = circleScale(circleScaleIndex);
          maxSize = d3.max([squareSize, circleSize]);

          sel.append('g')
              .attr('class', 'legend-items')
              .attr('transform', 'translate(' + 0 + ',' + margin.top + ')') 
            .selectAll('.legend-item')
              .data(electionTypes)
            .enter().append('g')
              .attr('class', 'legend-item')
              .call(renderItem);
          sel.append('text')
              .attr('class', 'legend-title')
              .text(title);

        });
      }

      render.y = function(val) {
        if (!arguments.length) return y;
        y = val; 
        return render; 
      };

      render.circleScale = function(val) {
        if (!arguments.length) return circleScale;
        circleScale = val; 
        return render; 
      };

      render.squareScale = function(val) {
        if (!arguments.length) return squareScale;
        squareScale = val; 
        return render; 
      };

      return render;
    }

    /**
     * Generate an array, appropriate for the range of an election size scale.
     */
    function sizeRange(d, max, pctChg) {
      // Starting with the maximum, each item should decrease by the pct
      // change
      var range = d.map(function(val) {
        return max * Math.exp(-1 * pctChg * val);
      }).reverse();

      // Zero should map to zero
      if (d[0] === 0) {
        range[0] = 0;
      }

      return range;
    }

    function viz(selection) {
      selection.each(function(data) {
        var containerWidth = parseInt(d3.select(this).style('width'), 10);
        // Set the width of the chart portion of the visualization to either
        // fill the width of the container, minus the legend width, if there
        // are a lot of years in the data.
        //
        // If there aren't a lot of years, ensure that each band is maxBandWidth
        // wide.
        var width = d3.min([containerWidth - legendMargin.left - legendWidth - legendMargin.right - margin.left - margin.right,
          data.length * maxBandWidth
        ]);
        var svg = d3.select(this).append('svg')
            .attr('class', 'elections-viz')
            .attr('width', containerWidth)
            .attr('height', height + margin.top + margin.bottom)
            // Explicitely set overflow to be visible on this container element
            // so the slider handles don't get cut off.  This seems like a simpler
            // way to handle this than calculating margins to accomodate it.
            .style({'overflow': 'visible'});
        // The inner container for the element.  Most of the other elements will        // go here. 
        var chart = svg.append('g')
            .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
        var years = data.map(function(d) { return d.year; }); 
        // d3.time.scale() seems like a better fit for the data, but it
        // doesn't provide the convenience of rangeBands.  Let's use
        // d3.scale.ordinal.
        var x = d3.scale.ordinal()
          .domain(years)
          .rangeBands([0, width], barPadding, barOuterPadding);
        var y = d3.scale.ordinal()
          .domain(electionTypes)
          .rangePoints([0, height], 2.0);
        // We have separate scales for special/runoff and primary/general
        // elections. This is so the primary/general elections are visually
        // prominent, even when they are fewer in number than the
        // special elections.
        //
        // We call clamp() on these scales so that values over our expected
        // maximum are rendered the same size as the shape of the maximum.
        var regularElecSize = d3.scale.linear()
          .domain(regularElectionDomain)
          .rangeRound(sizeRange(regularElectionDomain, x.rangeBand() * maxRegularElectionSizeFactor, regularElectionScaleFactor))
          .clamp(true);
        var specialElecSize = d3.scale.linear()
          .domain(specialElectionDomain)
          .rangeRound(sizeRange(specialElectionDomain, x.rangeBand() * maxSpecialElectionSizeFactor, specialElectionScaleFactor))
          .clamp(true);
        var renderRunoff = renderSquare()
          .electionType('runoff')
          .x(x)
          .y(y)
          .dim(specialElecSize);
        var renderSpecialGeneral = renderSquare()
          .electionType('special_general')
          .x(x)
          .y(y)
          .dim(specialElecSize);
        var renderGeneral = renderCircle()
          .electionType('general')
          .x(x)
          .y(y)
          .dim(regularElecSize);
        var renderSpecialPrimary = renderSquare()
          .electionType('special_primary')
          .x(x)
          .y(y)
          .dim(specialElecSize);
        var renderPrimary = renderCircle()
          .electionType('primary')
          .x(x)
          .y(y)
          .dim(regularElecSize);

        var xAxis = d3.svg.axis()
          .scale(x)
          .orient('bottom')
          .tickSize(15, 0);

        // Slider element
        var slider = yearSlider()
          .x(x);

        var renderLegend = electionTypeLegend()
          .y(y)
          .squareScale(specialElecSize)
          .circleScale(regularElecSize);

        var ticks, sliderg;

        chart.selectAll('.bar')
            .data(data)
          .enter().append('rect')
            .attr('class', 'bar')
            .attr('x', function(d) { return x(d.year); })
            .attr('height', height) 
            .attr('width', x.rangeBand());

        chart.append('g')
            .attr('class', 'hlines')
          .selectAll('.hline')
            .data(electionTypes)
          .enter().append('line')
            .attr('class', 'hline')
            .attr('x1', 0)
            .attr('y1', function(d) { return y(d); })
            .attr('x2', width)
            .attr('y2', function(d) { return y(d); });

        chart.selectAll('.runoff')
            .data(data)
          .call(renderRunoff);
          
        chart.selectAll('.special-general')
            .data(data)
          .call(renderSpecialGeneral);

        chart.selectAll('.general')
            .data(data)
          .call(renderGeneral);

        chart.selectAll('.special-primary')
            .data(data)
          .call(renderSpecialPrimary);

        chart.selectAll('.primary')
            .data(data)
          .call(renderPrimary);

        // Append the x axis and move it to the bottom of the visualization
        // Save a selection of all the tick g elements
        ticks = chart.append("g")
            .attr('class', 'x axis')
            .attr('transform', 'translate(0,' + height + ')')
            .call(xAxis)
          .selectAll('.tick');

        // Shift the ticks from the center of the year bar (the default) to
        // the beginning.
        ticks.attr('transform', function(d) { return 'translate(' + x(d) + ',0)'; });
        // Left-align the tick text
        ticks.selectAll("text")
            .style("text-anchor", "start");

        // Append the slider
        // It's important that this is added after the axis, so the slider
        // handles appear over the tickmarks
        sliderg = chart.append('g')
            .attr('class', 'brush slider')
            .attr('transform', 'translate(0,' + height + ')')
            .call(slider);

        // Append the election type legend
        legendg = svg.append('g')
            .attr('class', 'legend')
            .attr('transform', 'translate(' + (width + legendMargin.left) + ',' + 0 + ')')
            .call(renderLegend);
      });
    }

    viz.dispatcher = function(val) {
      if (!arguments.length) return dispatcher;
      dispatcher = val;
      return viz;
    };

    return viz;
  }

  var ResultsVisualizationView = Backbone.View.extend({
    initialize: function(options) {
      // Create the d3 chart function.  This will do most of the work.
      this.viz = electionsVisualization();

      // Proxy the d3 dispatched events to Backbone events
      this.viz.dispatcher().on('filterdates', _.bind(this.handleFilterDates, this));
      this.collection.on('sync', this.render, this);

      // Redraw the graphic when the window is resized
      $(window).on('resize.results', _.bind(this.debouncedRender, this));
    },

    render: function() {
      this.$el.empty();

      d3.select(this.el)
        .datum(this.collection.yearSummary())
        .call(this.viz);

      return this;
    },

    debouncedRender: _.debounce(function() {
      return this.render();
    }, 500),

    handleFilterDates: function(start, end) {
      Backbone.trigger('filter:dates', start.toString(), end.toString());
    }
  });

  var SelectFilterView = Backbone.View.extend({
    events: {
      'change select': 'handleChange'
    },

    render: function() {
      var selectId = this.options.attribute + '-filter';

      this.$select = $('<select>')
        .attr('id', selectId)
        .appendTo(this.$el);
      var $label = $('<label>')
        .attr('for', selectId)
        .text(this.options.label)
        .insertBefore(this.$select); 
      _.each(this.options.options, function(option) {
        var val = option[0];
        var label = option[1];
        var $opt = $('<option>')
          .attr('value', val)
          .text(label)
          .appendTo(this.$select);
      }, this);
      return this;
    },

    handleChange: function(evt) {
      var val = $(evt.target).val();
      var eventName = 'filter:' + this.options.attribute;
      Backbone.trigger(eventName, val);
    },

    reset: function() {
      this.$select.val(this.options.options[0][0]);
    }
  });

  var OfficeFilterView = SelectFilterView.extend({
    attributes: {
      'id': 'office-filter-container'
    },

    options: {
      attribute: 'office',

      label: "Office Type",

      options: OFFICES     
    }
  });

  var RaceTypeFilterView = SelectFilterView.extend({
    attributes: {
      'id': 'race-type-filter-container'
    },

    options: {
      attribute: 'race_type',
      
      label: "Race Type",

      options: RACE_TYPES 
    }
  });

  /**
   * Encapsulates and connects the Backbone components that are part of this
   * app.
   */
  function ResultsApp(el, options) {
    this.initialize.apply(this, arguments);
  }

  _.extend(ResultsApp.prototype, {
    /**
     * Initialze the results application.
     *
     * Creates instances of Backbone views and routers.
     *
     * @param {(string|jQuery)} el - Selector or jQuery object of container
     *   element for this app instance.
     * @param options.root - Path of the page where the application is being
     *   served if it is not the root of the domain, for example "/results/".
     */
    initialize: function(el, options) {
      options = options || {};

      // Create collections
      this._collection = new Elections(null, {
        dataRoot: options.dataRoot
      });
      this._statesCollection = new openelex.States();
      this._statesCollection.url = options.statusJSON;
      this._statesCollection.fetch();

      // Create sub-views
      this._headingView = new ResultsHeadingView({
        collection: this._collection
      });
      this._tableView = new ResultsTableView({
        collection: this._collection,
        id: 'results-table'
      });
      this._resultsVizView = new ResultsVisualizationView({
        collection: this._collection
      });
      this._officeFilterView = new OfficeFilterView();
      this._raceTypeFilterView = new RaceTypeFilterView();
      this._sidebarView = new openelex.StateMetadataView({
        el: options.sidebarEl,
        collection: this._statesCollection
      });
      this._sidebarView.$el.addClass('results-detail');

      $(el).append(this._resultsVizView.$el);
      $(el).append(this._headingView.$el);
      $(el).append(this._raceTypeFilterView.render().$el);
      $(el).append(this._officeFilterView.render().$el);
      $(el).append(this._tableView.$el);

      // Wire-up event handlers
      Backbone.on('state', this.handleState, this);

      // Create and initialize routers
      this._router = new ResultsRouter();

      this._statesCollection.once('sync', function() {
        Backbone.history.start({root: options.root});
      });
    },

    handleState: function(state) {
      this._collection.setState(state).fetch();
      this._sidebarView.setState(state).render();
      this._officeFilterView.reset();
    }
  });

  _.extend(openelex, {
    Election: Election,
    Elections: Elections,
    ResultsTableView: ResultsTableView,
    ResultsApp: ResultsApp
  });
})(window, document, jQuery, _, Backbone, d3, window.openelex || {});
