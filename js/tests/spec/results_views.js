describe("ResultsTableView", function() {
  var MockElection = Backbone.Model.extend();
  var NoResultsElection = MockElection.extend({
    reportingLevelUrl: function(level, raw) {
      return null;
    },

    statusAttr: function(level) {
      return openelex.Election.prototype.statusAttr.apply(this, arguments);
    }
  });
  var MockElections = Backbone.Collection.extend({
    model: MockElection
  });
  var collection;
  var view;

  beforeEach(function() {
    collection = new MockElections(); 
    view = new openelex.ResultsTableView({
      collection: collection
    });
  });

  describe('renderDownloadWidget()', function() {
    it('includes a grey arrow with no link when results are planned but not available', function() {
      var election = new NoResultsElection({
        'county_level_status': 'yes',
        'precinct_level_status': 'yes',
        'cong_dist_level_status': 'yes',
        'state_leg_level_status': 'yes',
      });
      var $el;

      $el = view.renderDownloadWidget(election, 'county');
      expect($el.is('img')).toBeTruthy();
      expect($el.attr('src')).toContain("lt_grey_download_arrow.png");
    });
  });
});
