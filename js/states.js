(function(window, document, $, _, Backbone, openelex) {
  window.openelex = openelex;

  openelex.States = Backbone.Collection.extend({
    url: 'data/state_status.json',

    initialize: function(models, options) {
      options = options || {};
      if (options.url) {
        this.url = options.url;
      }
    }
  });

  openelex.StateMetadataView = Backbone.View.extend({
    attributes: {
      class: 'infobox'
    },

    template: _.template("<h2><%= state %></h2>" +
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

      this.$el.html(this.template({
        state: this.model.get('name'),
        detail_url: '/results/#' + this.model.get('postal').toLowerCase(),
        results_status: this.resultsStatusLabel(this.model.get('results_status')),
        metadata_status: this.model.get('metadata_status'),
        volunteers: volunteers.join(', ')
      }));

      this.$el.addClass(this.attributes.class);
      
      return this;
    },
     
    resultsStatusLabel: function(s) {
      if (s === 'raw') {
        return "Raw Data";
      }
      else if (s === 'clean') {
        return "Clean Data";
      }
      else {
        return "Not Started";
      }
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
})(window, document, jQuery, _, Backbone, window.openelex || {});
