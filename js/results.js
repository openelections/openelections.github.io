/**
 * Display available election results and download links.
 */
(function(window, document, $, _, Backbone, openelex) {
  window.openelex = openelex;

  var REPORTING_LEVELS = ['county', 'state_legislative', 'precinct'];

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
     }
  });

  // Collections

  var Elections = Backbone.Collection.extend({
    model: Election,

    initialize: function(models, options) {
      this._years = {};
      if (models) {
        _.each(models, this.addYear, this);
      }

      this._dataRoot = options.dataRoot;
      this.on('add', this.addYear, this);
    },

    url: function() {
      return this._dataRoot + '/elections-' + this._state + '.json';
    },

    setState: function(state) {
      this._state = state;
      this._years = {};
      return this;
    },

    addYear: function(model) {
      this._years[model.get('year')] = true;
    },

    years: function() {
      return _.map(_.keys(this._years).sort(), function(yearS) {
        return parseInt(yearS);
      });
    },

    filterOffice: function(office) {
      var filterArgs = {};
      var filtered;

      if (office === 'any') {
        filtered = new Elections(this.models, {
          state: this._state,
          dataRoot: this._dataRoot
        });
      }
      else {
        filterArgs[office] = true;
        filtered = new Elections(this.where(filterArgs), {
          state: this._state,
          dataRoot: this._dataRoot
        });
      }

      this.trigger('filter', filtered);
      return filtered;
    }
  });

  // Views

  var ResultsTableView = Backbone.View.extend({
    tagName: 'table',

    attributes: {
      class: 'table'
    },

    options: {
      headerRows: [
        ["Date", "Race", "Results", "", ""],
        ["", "", "County", "State Legislative", "Precinct"]
      ],
    },

    events: {
      "click .year-heading": 'handleClickYear'
    },

    initialize: function(options) {
      this.renderInitial();

      this.filteredCollection = this.collection;
      this.collection.on('sync', this.render, this);
      this.collection.on('filter', this.handleFilter, this);
    },

    render: function() {
      var years = this.filteredCollection.years();
      this._$tbody.empty();
      _.each(years, function(year) {
        var $tr = $('<tr>').appendTo(this._$tbody);
        $('<th colspan="5" class="year-heading" data-year="' + year + '">' + year + '</th>').appendTo($tr);

        _.each(this.filteredCollection.where({year: year}), function(elections) {
            var $tr = $('<tr class="election" data-year="' + year + '">').appendTo(this._$tbody);
            $tr.append($('<td>' + elections.get('start_date') + '</td>'));
            $tr.append($('<td>' + elections.get('race_type') + '</td>'));

            _.each(REPORTING_LEVELS, function(level) {
              // @todo Add URLs for clean data, but we only have raw for now, so don't worry about it
              var url = elections.reportingLevelUrl(level, true);
              if (url) {
                $tr.append('<td><a href="' + url + '"><span class="glyphicon glyphicon-download"></span></a></td>'); 
              }
              else {
                $tr.append('<td>');
              }
            }, this);
        }, this);
      }, this);

      this.expandYear(years[0]);

      return this;
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

    handleFilter: function(filtered) {
      this.filteredCollection = filtered;
      this.render();
    }
  });

  var OfficeFilterView = Backbone.View.extend({
    attributes: {
      'id': 'office-filter-container'
    },

    options: {
      offices: [
        ['any', "Any Office"],
        ['prez', "President"],
        ['senate', "U.S. Senate"],
        ['house', "U.S. House"],
        ['gov', "Governor"],
        ['state_officers', "State Officers"],
        ['state_leg', "State Legislature"]
      ]
    },

    events: {
      'change select': 'handleChange'
    },

    render: function() {
      var $select = $('<select>')
        .attr('id', 'office-filter')
        .appendTo(this.$el);
      var $label = $('<label>')
        .attr('for', 'office-filter')
        .text("Filter by Office Type")
        .insertBefore($select); 
      _.each(this.options.offices, function(office) {
        var val = office[0];
        var label = office[1];
        var $opt = $('<option>')
          .attr('value', val)
          .text(label)
          .appendTo($select);
      }, this);
      return this;
    },

    handleChange: function(evt) {
      var val = $(evt.target).val();
      this.collection.filterOffice(val);
    }
  });

  /**
   * Encapsulates and connects the Backbone components that are part of this
   * app.
   */
  function ResultsApp(el, options) {
    this.initialize.apply(this, arguments);
  }
  openelex.ResultsApp = ResultsApp;

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

      // Create sub-views
      this._tableView = new ResultsTableView({
        collection: this._collection
      });
      this._officeFilterView = new OfficeFilterView({
        collection: this._collection 
      });
      $(el).append(this._officeFilterView.render().$el);
      $(el).append(this._tableView.$el);

      // Wire-up event handlers
      Backbone.on('state', this.handleState, this);

      // Create and initialize routers
      this._router = new ResultsRouter();
      Backbone.history.start({root: options.root});
    },

    handleState: function(state) {
      this._collection.setState(state).fetch();
    }
  });

})(window, document, jQuery, _, Backbone, window.openelex || {});
