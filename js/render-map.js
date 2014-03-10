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
    width: 600,
    height: 400,
    mapContainer: '#map',
    sidebarEl: '#sidebar',
    statusJSON: 'js/sample_metadata_status.json'
  };

  var renderMap = openelex.renderMap = function(options) {
    opts = _.defaults({}, options, defaults);
    console.log(opts);

    //Define map projection

    var projection = d3.geo.albersUsa()
      .translate([opts.width / 2, opts.height / 2])
      .scale([800]);

    //Define path generator
    path = d3.geo.path()
      .projection(projection);

    //Define quantize scale to sort data values into buckets of color
    color = d3.scale.ordinal()
      .range(["rgb(237,248,233)","rgb(116,196,118)","rgb(0,109,44)"])
      //Colors taken from colorbrewer.js, included in the D3 download
      //Set input domain for color scale
      .domain(["Not Started","Partial", "Up-to-date"]);


    //Create SVG element
    var mapdiv = d3.select(opts.mapContainer);

    svg = mapdiv.append("svg")
      .attr("width", opts.width)
      .attr("height", opts.height);

    sidebar = d3.select(opts.sidebarEl);

    //var left = d3.select("#main");
    //var sidebar = left.append('div').attr("class","col-md-4 column");

    d3.json(opts.statusJSON, processJSON);
  };

  function processJSON(data) {
    data.objects.forEach(function(row) {
      stateStatuses[row.state] = row;
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
    //Bind data and create one path per GeoJSON feature
    svg.selectAll("path")
      .data(geo.features)
      .enter()
      .append("path")
      .attr("d", path)
      .style("fill", function(d) {
        var value = d.properties.status;
        return value ? color(value) : '#ccc';
      })
      .attr("stroke", "white")
      .attr("stroke-width", 1)
      .on('mouseover', function(d) {
        var dd = d.properties;
        sidebar.html('<strong>' + dd.state + '</strong><br> Metadata Status: ' + dd.status + '<br> Volunteer(s): ' +  dd.volunteers);
        sidebar.attr("class", "infobox col-md-4");
      })
      .on('mouseout', function(d) {
        var dd = d.properties;
        sidebar.html(' ');
        sidebar.attr("class", "col-md-4");
      });
  }
})(window, document, _, d3);
