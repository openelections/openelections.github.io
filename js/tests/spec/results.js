describe("Elections collection", function() {
  var collection;

  beforeEach(function(done) {
    collection = new openelex.Elections(null, {
      dataRoot: 'data' 
    });
    collection.once('sync', done);
    collection.setState('md').fetch();
  });

  describe("filterElections method", function() {
    it("Should filter by office", function() {
      var filtered = collection.filterElections({
        office: "prez"
      });
      var startDates = [
        "2000-11-07",
        "2000-03-07",
        "2004-11-02",
        "2004-03-02",
        "2008-11-04",
        "2008-02-12",
        "2012-04-03",
        "2012-11-06"
      ];
      expect(filtered.length).toEqual(startDates.length);
      startDates.forEach(function(date) {
        expect(filtered.findWhere({
          'start_date': date
        })).toBeDefined();
      });
    });

    it("Should filter by a date range", function() {
      var filtered = collection.filterElections({
        dateStart: "2000-01-01",
        dateEnd: "2003-12-31"
      });
      var startDates = [
        "2000-11-07",
        "2000-03-07",
        "2002-11-05",
        "2002-09-10"
      ];
      expect(filtered.length).toEqual(startDates.length);
      startDates.forEach(function(date) {
        expect(filtered.findWhere({
          'start_date': date
        })).toBeDefined();
      });
    });

    it("Should filter by office and date range together", function() {
      var filtered = collection.filterElections({
        dateStart: "2000-01-01",
        dateEnd: "2003-12-31",
        office: "prez"
      });
      var startDates = [
        "2000-11-07",
        "2000-03-07",
      ];
      expect(filtered.length).toEqual(startDates.length);
      startDates.forEach(function(date) {
        expect(filtered.findWhere({
          'start_date': date
        })).toBeDefined();
      });
    });
  });
});
