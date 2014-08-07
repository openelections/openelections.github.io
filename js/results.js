/**
 * Display available election results and download links.
 */
(function(window, document, $, _, Backbone, openelex) {
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
     }
  });

  // Collections

  var Elections = Backbone.Collection.extend({
    model: Election,

    initialize: function(models, options) {
      options = options || {};

      this.comparator = options.comparator || 'start_date';
      this._years = {};
      this._dates = {};
      if (models) {
        _.each(models, this.addDates, this);
      }

      this._dataRoot = options.dataRoot;
      this.on('add', this.addDates, this);
    },

    url: function() {
      return this._dataRoot + '/elections-' + this._state + '.json';
    },

    setState: function(state) {
      this._state = state;
      this._years = {};
      this._dates = {};
      return this;
    },

    addDates: function(model) {
      this._years[model.get('year')] = true;
      this._dates[model.get('start_date')] = true;
    },

    years: function() {
      return _.map(_.keys(this._years).sort().reverse(), function(yearS) {
        return parseInt(yearS);
      });
    },

    dates: function() {
      return _.keys(this._dates).sort();
    },

    filterElections: function(filterArgs) {
      var office = filterArgs.office;
      var dateStart = filterArgs.dateStart;
      var dateEnd = filterArgs.dateEnd;
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

      raceTypeLabels: _.extend(_.object(RACE_TYPES), {
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
      startYear = this._filterArgs.dateStart.slice(0, 4);
      endYear = this._filterArgs.dateEnd.slice(0, 4);

      this.$el.text(raceTypeLabel + officeLabel + "Races " + startYear + " - " + endYear);

      return this;
    },

    _getInitialDates: function() {
      return {
        dateStart: this.collection.first().get('start_date'), 
        dateEnd: this.collection.last().get('start_date') 
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

  var DateFilterView = Backbone.View.extend({
    attributes: {
      'id': 'date-filter-container'
    },

    initialize: function(options) {
      this.collection.on('sync', this.render, this);
    },

    render: function() {
      this.$el.empty();
      this.dates = this.collection.dates();
      this.$slider = this.initSlider(this.dates);
      this.$el.append(this.$slider);
      this.$elections = $('<div>').addClass('elections').prependTo(this.$el);
      this.collection.each(function(election, i, collection) {
        var left = (i / (collection.length - 1)) * 100 + '%'; 
        var title = election.get('start_date') + " ";
        var $bar;

        title += election.raceLabel(); 

        $bar = $('<div>').addClass('election')
          .addClass(election.get('race_type'))
          .attr('title', title)
          .css('left', left);
        if (election.get('special')) {
          $bar.addClass('special');
        }
        this.$elections.append($bar);
      }, this);
      return this;
    },

    initSlider: function(dates) {
      var year, prevYear, left;
      var $slider = $('<div>').addClass('date-slider').slider({
        range: true,
        min: 0,
        max: dates.length - 1,
        values: [0, dates.length - 1],
        change: _.bind(this.handleSliderChange, this)
      });

      for (var i = 0; i < dates.length; i++) {
        year = dates[i].split('-')[0];
        if (year != prevYear) {
          left = (i / (dates.length - 1)) * 100 + '%';
          $('<label>').text(year).attr('title', year)
            .addClass('year').css('left', left).appendTo($slider);
        }

        prevYear = year;
      }

      return $slider;
    },

    handleSliderChange: function(evt, ui) {
      var $slider = $(evt.target);
      var values = $slider.slider('values');
      Backbone.trigger('filter:dates', this.dates[values[0]], this.dates[values[1]]);
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
      this._dateFilterView = new DateFilterView({
        collection: this._collection
      });
      this._officeFilterView = new OfficeFilterView();
      this._raceTypeFilterView = new RaceTypeFilterView();
      this._sidebarView = new openelex.StateMetadataView({
        el: options.sidebarEl,
        collection: this._statesCollection
      });
      this._sidebarView.$el.addClass('results-detail');

      $(el).append(this._dateFilterView.$el);
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
    Elections: Elections,
    ResultsTableView: ResultsTableView,
    ResultsApp: ResultsApp
  });
})(window, document, jQuery, _, Backbone, window.openelex || {});
