(function(window, document, $, _, Backbone, openelex) {
  window.openelex = openelex;

  var STATUS_LABELS = {
    partial: "In progress",
    'up-to-date': "Up-to-date",
    raw: "Raw Data",
    clean: "Clean Data"
  };

  var statusLabel = openelex.statusLabel = function(s) {
    var label = STATUS_LABELS[s];
    return label || "Not Started";
  };

  openelex.States = Backbone.Collection.extend({
    url: 'data/state_status.json'
  });

  openelex.StateMetadataView = Backbone.View.extend({
    attributes: {
      class: 'infobox'
    },

    template: _.template("<h2 class='stateface stateface-<%= postal %>'><%= state %></h2>" +
      "<dl class='metadata'>" +
      "<dt>Metadata Status</dt><dd><%= metadata_status %></dd>" + 
      "<dt>Volunteer(s)</dt><dd><%= volunteers %></dd>" +
      "</dl>" +
      "<dl class='results'>" +
      "<dt class='results-status'>Results Status</dt><dd class='results-status'><%= results_status %></dd>" +
      "<dt class='detail-link'>Detailed Data</dt><dd class='detail-link'><a href='<%= detail_url %>'>Detailed Data</a></dd>" +
      "</dl>" + 
      "<dl class='results-detail'>" +
      "<dt class='results-status'>Results Status</dt><dd class='results-status'><%= results_status %></dd>" +
      "<dt class='map-link'>Map Link</dt><dd class='map-link'><a href='/'>Data Map</a></dd>" +
      "</dl>"),

    render: function() {
      var volunteers = _.map(this.model.get('volunteers'), function(v) {
        return v.full_name;
      });
      var postal = this.model.get('postal').toLowerCase();

      this.$el.html(this.template({
        state: this.model.get('name'),
        postal: postal,
        detail_url: '/results/#' + postal,
        results_status: statusLabel(this.model.get('results_status')),
        metadata_status: statusLabel(this.model.get('metadata_status')),
        volunteers: volunteers.join(', ')
      }));

      this.$el.addClass(this.attributes.class);
      
      return this;
    },
     
    /**
     * Set the state who's metadata will be rendered in this view.
     *
     * @param {string} state - State name or abbreviation.  For example, 
     *   "Maryland" or "md".
     */
    setState: function(state) {
      this.model = this.collection.findWhere({name: state}) || this.collection.findWhere({postal: state.toUpperCase()});
      return this;
    }
  });

  var StateTable = Backbone.View.extend({
    options: {
      rowTemplate: _.template('<tr><td><%= name %></td><td><%= status %></td></tr>')
    },

    initialize: function() {
      this.collection.on('sync', this.render, this);  
    },

    tagName: 'table',

    attributes: {
      class: 'table'
    },

    render: function() {
      var $thead = $('<thead>');
      var $tbody = $('<tbody>');

      this.$el.empty();
      
      $thead.append("<tr><th>State</th><th>Status</th></tr>");
      this.collection.each(function(state) {
        $tbody.append(this.renderRow(state));
      }, this);
      this.$el.append($thead);
      this.$el.append($tbody);

      return this;
    },

    renderRow: function(d) {
      return $(this.options.rowTemplate(this.rowData(d)));
    },

    rowData: function(d) {
      return {}; 
    }
  });

  openelex.StateMetadataTableView = StateTable.extend({
    attributes: {
      class: 'table-states metadata table'
    },

    rowData: function(d) {
      return {
        name: d.get('name'),
        status: statusLabel(d.get('metadata_status')) 
      };
    }
  });

  openelex.StateResultsTableView = StateTable.extend({
    attributes: {
      class: 'table-states results table'
    },

    rowData: function(d) {
      return {
        name: d.get('name'),
        status: statusLabel(d.get('results_status')) 
      };
    }
  });
})(window, document, jQuery, _, Backbone, window.openelex || {});
