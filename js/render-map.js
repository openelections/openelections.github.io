(function(window, document, _, d3, openelex) {
  window.openelex = openelex;

  var stateStatuses = {};
  var geo;
  var svg;
  var path;
  var mapdiv;
  var sidebar;
  var toggle;
  var metadataLegend, resultsLegend;

  var defaults = {
    mapContainer: '#map',
    metadataLegendEl: '#legend-metadata',
    resultsLegendEl: '#legend-results',
    sidebarEl: '#sidebar',
    statusJSON: 'data/state_status.json'
  };

  var metadataTpl = _.template("<h3><%= state %></h3>" +
    "<dl class='metadata'>" +
    "<dt>Metadata Status</dt><dd><%= metadata_status %></dd>" + 
    "<dt>Volunteer(s)</dt><dd><%= volunteers %></dd>" +
    "</dl>" +
    "<dl class='results'>" +
    "<dt class='results-status'>Results Status</dt><dd class='results-status'><%= results_status %></dd>" +
    "<dt class='detail-link'>Detailed Data</dt><dd class='detail-link'><a href='<%= detail_url %>'>Detailed Data</a></dd>" +
    "</dl>");

  var dispatcher = d3.dispatch('maptype'); 

  var renderMap = openelex.renderMap = function(options) {
    opts = _.defaults({}, options, defaults);

    mapdiv = d3.select(opts.mapContainer);
    toggle = d3.select(mapdiv[0][0].parentNode)
                     .insert('div', opts.metadataLegendEl)
                     .attr('id', 'toggle');
    metadataLegend = d3.select(opts.metadataLegendEl);
    resultsLegend = d3.select(opts.resultsLegendEl);

    var aspect = 0.6;
    if (!opts.width) {
      opts.width = mapdiv.node().offsetWidth;
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
      renderToggle(toggle);
      setMapType('metadata');
    });
  }

  function slugify(val) {
    if (!val) {
      return '';
    }
    else {
      var slug = val.toLowerCase();
      return slug.replace(/\s+/, '-');
    }
  }

  function render() {
    // Bind data and create one path per GeoJSON feature
    svg.selectAll("path")
      .data(geo.features)
      .enter()
      .append("path")
      .attr("d", path)
      .attr("class", function(d) {
        var metadataClass = 'metadata-' + (slugify(d.properties.metadata_status) || 'not-started');
        var resultsClass = 'results-' + (slugify(d.properties.results_status) || 'not-started');
        return metadataClass + " " + resultsClass;
      })
      .attr("stroke", "white")
      .attr("stroke-width", 1)
      .on('click', function(d) {
        var dd = d.properties;
        // Extract volunteer names
        var volunteers = _.map(dd.volunteers, function(v) {
          return v.full_name;
        });
        renderSidebar({
          state: dd.name,
          detail_url: '/results/#' + dd.postal.toLowerCase(),
          results_status: resultsStatusLabel(dd.results_status),
          metadata_status: dd.metadata_status,
          volunteers: volunteers.join(', ')
        });
      });
  }

  function renderSidebar(attrs) {
    sidebar.html(metadataTpl(attrs));
    sidebar.classed("infobox", true);
  }

  /**
   * Render the control that toggles between the metadata and results view.
   *
   * @param el {d3.selection} el D3 selection for the container element where
   *   the toggle control will be rendered.
   */
  function renderToggle(el) {
    var metaBtn = el.append('button')
      .attr('class', 'btn-toggle btn-metadata')
      .text("Metadata");
    var resultsBtn = el.append('button')
      .attr('class', 'btn-toggle btn-results')
      .text("Data");

    metaBtn.on('click', function() {
      dispatcher.maptype('metadata');
    });

    resultsBtn.on('click', function() {
      dispatcher.maptype('results');
    });
    return el;
  }

  /**
   * Event handler for when the map type is changed.
   */
  function setMapType(maptype) {
    var containerClasses;

    if (maptype === 'metadata') {
      metadataLegend.style('display', 'block');
      resultsLegend.style('display', 'none');
      containerClasses = { 
        'metadata': true,
        'results': false
      };
    }
    else {
      metadataLegend.style('display', 'none');
      resultsLegend.style('display', 'block');
      containerClasses = {
        'metadata': false,
        'results': true
      };
    }

    toggle.classed(containerClasses);
    mapdiv.classed(containerClasses);
    sidebar.classed(containerClasses);
  }

  function resultsStatusLabel(s) {
    if (s === 'raw') {
       return "Raw Data";
    }
    else if (s === 'clean') {
       return "Clean Data";
    }
    else {
      return "Not Started";
    }
  }

  dispatcher.on('maptype', setMapType);
})(window, document, _, d3, window.openelex || {});
