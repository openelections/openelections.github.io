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

  var State = openelex.State = Backbone.Model.extend({
    metadataVolunteerNames: function() {
      return this._volunteerNames(this.get('metadata_volunteers'));
    },

    devVolunteerNames: function() {
      return this._volunteerNames(this.get('dev_volunteers'));
    },

    detailUrl: function() {
      return '/results/#' + this.get('postal').toLowerCase();
    },

    _volunteerNames: function(volunteers) {
      return _.map(volunteers, function(v) {
        return v.full_name;
      });
    }
  });

  openelex.States = Backbone.Collection.extend({
    url: 'data/state_status.json',

    model: State
  });

  openelex.StateMetadataView = Backbone.View.extend({
    attributes: {
      class: 'infobox'
    },

    template: _.template("<h2 class='stateface stateface-<%= postal %>'><%= state %></h2>" +
      "<dl class='metadata'>" +
      "<dt>Metadata Status</dt><dd><%= metadata_status %></dd>" +
      "<dt>Volunteer(s)</dt><dd><%= metadata_volunteers %></dd>" +
      "</dl>" +
      "<dl class='results'>" +
      "<dt class='results-status'>Results Status</dt><dd class='results-status'><%= results_status %></dd>" +
      "<dt>Volunteer(s)</dt><dd><%= dev_volunteers %></dd>" +
      "<dt class='detail-link'>Detailed Data</dt><dd class='detail-link'><a href='<%= detail_url %>'>Detailed Data</a></dd>" +
      "</dl>" +
      "<dl class='results-detail'>" +
      "<dt class='results-status'>Results Status</dt><dd class='results-status'><%= results_status %></dd>" +
      "<dt class='map-link'>Map Link</dt><dd class='map-link'><a href='/'>Data Map</a></dd>" +
      "</dl>"),

    render: function() {
      var postal = this.model.get('postal').toLowerCase();

      this.$el.html(this.template({
        state: this.model.get('name'),
        postal: postal,
        detail_url: this.model.detailUrl(),
        results_status: statusLabel(this.model.get('results_status')),
        metadata_status: statusLabel(this.model.get('metadata_status')),
        metadata_volunteers: this.model.metadataVolunteerNames().join(', '),
        dev_volunteers: this.model.devVolunteerNames().join(', ')
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
      rowTemplate: _.template('<tr><td><a href="<%= detail_url %>"><%= name %></a></td><td class="<%=status_class%>"><%= status %></td><td><%= volunteers %></td></tr>')
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

      $thead.append("<tr><th>State</th><th>Status</th><th>Volunteers</th></tr>");
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
        detail_url: d.detailUrl(),
        status: statusLabel(d.get('metadata_status')),
        status_class: d.get('metadata_status'),
        volunteers: d.metadataVolunteerNames().join(', ')
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
        detail_url: d.detailUrl(),
        status: statusLabel(d.get('results_status')),
        status_class: d.get('metadata_status'),
        volunteers: d.devVolunteerNames().join(', ')
      };
    }
  });
})(window, document, jQuery, _, Backbone, window.openelex || {});
