describe("Election model", function() {
  describe("normalizedRaceType method", function() {
    it("returns 'runoff' for any kind of runoff election", function() {
      var model = new openelex.Election({
        race_type: 'primary-runoff'
      });
      expect(model.normalizedRaceType()).toEqual('runoff');
      model.set('race_type', 'general-runoff');
      expect(model.normalizedRaceType()).toEqual('runoff');
    });

    it("returns 'general' for a non-runoff, non-special general election", function() {
      var model = new openelex.Election({
        race_type: 'general'
      });
      expect(model.normalizedRaceType()).toEqual('general');
    });

    it("returns 'primary' for a non-runoff, non-special primary election", function() {
      var model = new openelex.Election({
        race_type: 'primary'
      });
      expect(model.normalizedRaceType()).toEqual('primary');
    });

    it("prepends 'special' to the race type for special elections", function() {
      var model = new openelex.Election({
        race_type: 'general',
        special: true
      });
      expect(model.normalizedRaceType()).toEqual('special_general');
      model.set('race_type', 'primary');
      expect(model.normalizedRaceType()).toEqual('special_primary');
    });

  });
});

describe("Elections collection", function() {
  var collection;

  function fetchStateData(state, done) {
    collection = new openelex.Elections(null, {
      dataRoot: 'data' 
    });
    collection.once('sync', done);
    collection.setState(state).fetch();
  }

  describe("electionDates method", function() {
    beforeEach(function(done) {
      fetchStateData('md', done);
    });

    it("Should return a list of unique dates of elections in the collection", function() {
      var dates = [
        "2000-03-07",
        "2000-11-07",
        "2002-09-10",
        "2002-11-05",
        "2004-03-02",
        "2004-11-02",
        "2006-09-12",
        "2006-11-07",
        "2008-02-12",
        "2008-06-17",
        "2008-11-04",
        "2010-09-14",
        "2010-11-02",
        "2012-04-03",
        "2012-11-06"
      ];
      var i;
      var electionDates = collection.dates();
      for (i = 0; i < dates.length; i++) {
        expect(electionDates[i]).toEqual(dates[i]);
      }
    });
  });

  describe("filterElections method", function() {
    beforeEach(function(done) {
      fetchStateData('md', done);
    });

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

    it("Should filter by race type", function() {
      // Match only general races
      var filtered = collection.filterElections({
        raceType: 'general'
      });
      var startDates = [
        "2000-11-07",
        "2002-11-05",
        "2004-11-02",
        "2006-11-07",
        // This one is a special general
        "2008-06-17",
        "2008-11-04",
        "2010-11-02",
        "2012-11-06"
      ];
      expect(filtered.length).toEqual(startDates.length);
      startDates.forEach(function(date) {
        expect(filtered.findWhere({
          'start_date': date
        })).toBeDefined();
      });

      // Match Special General races
      filtered = collection.filterElections({
        raceType: 'special_general'
      });
      startDates = [
        "2008-06-17"
      ];
      expect(filtered.length).toEqual(startDates.length);
      startDates.forEach(function(date) {
        expect(filtered.findWhere({
          'start_date': date
        })).toBeDefined();
      });
    });
  });

  describe("yearSummary method", function() {
    beforeEach(function(done) {
      fetchStateData('fl', done);
    });

    it("Should return an array with one item per year", function() {
      var startYear = 2000;
      var endYear = 2012;
      var numYears = endYear - startYear;
      var summaries = collection.yearSummary();
      var i;

      expect(summaries.length).toEqual(numYears);
      for (i = 0; i < numYears; i++) {
        expect(summaries[i].year).toEqual(startYear + i); 
      }
    });

    it("has entries that reflect the number of elections of each type for the year", function() {
      var summaries = collection.yearSummary();
      var summary = summaries[0]; // 2000
      
      expect(summary.runoff).toEqual(3);
      expect(summary.general).toEqual(1);
      expect(summary.special_general).toEqual(2);
      expect(summary.primary).toEqual(2);
      expect(summary.special_primary).toEqual(1);
    });
  });
});
