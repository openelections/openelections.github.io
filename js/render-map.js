(function(window, document, _, d3) {
  // Create a namespace for our app
  var openelex = {};
  window.openelex = openelex;

  var stateStatuses = {};
  var geo;
  var svg;
  var path;
  var color;
  var sidebar;

  var defaults = {
    mapContainer: '#map',
    sidebarEl: '#sidebar',
    statusJSON: 'data/state_status.json'
  };

  var renderMap = openelex.renderMap = function(options) {
    opts = _.defaults({}, options, defaults);

    var mapdiv = d3.select(opts.mapContainer);
    var aspect = 0.6;
    if (!opts.width) {
      opts.width = mapdiv.node().offsetWidth;
      console.log(opts.width);
    }
    if (!opts.height) {
      opts.height = aspect * opts.width;
    }

    //Define map projection
    
    var projection = d3.geo.albersUsa()
      .translate([opts.width / 2, opts.height / 2])
      .scale(getScale(opts.width));

    //Define path generator
    path = d3.geo.path()
      .projection(projection);

    //Define quantize scale to sort data values into buckets of color
    color = d3.scale.ordinal()
      .range(["rgb(237,248,233)","rgb(116,196,118)","rgb(0,109,44)"])
      //Colors taken from colorbrewer.js, included in the D3 download
      //Set input domain for color scale
      .domain(["not started","partial", "up-to-date"]);

    // Create SVG element
    svg = mapdiv.append("svg")
      .attr("width", opts.width)
      .attr("height", opts.height);

    sidebar = d3.select(opts.sidebarEl);

    d3.json(opts.statusJSON, processJSON);

    d3.select(window).on('resize', function() {
      var width = mapdiv.node().offsetWidth;
      var height = width * aspect;
      projection.translate([width / 2, height / 2])
        .scale(getScale(width));
      svg.attr("width", width)
        .attr("height", height);
      svg.selectAll('path').attr('d', path);
    });
  };

  /**
   * Returns the scale for the map's projection based on its width.
   */
  function getScale(width) {
    return (width / 800) * 1000;
  }

  function processJSON(data) {
    _.each(data, function(state) {
      stateStatuses[state.name] = state;

    });
    loadGeo();
  }

  function loadGeo() {
    //Load in GeoJSON data
    d3.json("data/us-states.json", function(json) {
      json.features.forEach(function(feature) {
        if (stateStatuses[feature.properties.name]) {
          feature.properties = stateStatuses[feature.properties.name];
        } else {
          console.log("No match", feature.properties.name);
        }
      });

      geo = json;
      render();
    });
  }

  function render() {
    var tpl = _.template("<strong><%= state %></strong><br> Metadata Status: <%= status %><br> Volunteer(s): <%= volunteers %>");
    
    // Bind data and create one path per GeoJSON feature
    svg.selectAll("path")
      .data(geo.features)
      .enter()
      .append("path")
      .attr("d", path)
      .style("fill", function(d) {
        var value = d.properties.metadata_status;
        return value ? color(value) : '#ccc';
      })
      .attr("stroke", "white")
      .attr("stroke-width", 1)
      .on('click', function(d) {
        var dd = d.properties;
        // Extract volunteer names
        var volunteers = _.map(dd.volunteers, function(v) {
          return v.full_name;
        });
        sidebar.html(tpl({
          state: dd.name,
          status: dd.metadata_status,
          volunteers: volunteers.join(', ')
        }));
        sidebar.attr("class", "infobox col-md-4");
      });
  }
})(window, document, _, d3);
