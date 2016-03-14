(function(window, document, _, d3, openelex) {
  window.openelex = openelex;

  var stateStatuses = {};
  var geo;
  var svg;
  var path;
  var mapdiv;
  var body = d3.select('body');
  var sidebar;
  var toggle;
  var metadataLegend, resultsLegend;
  var statesCollection, stateMetadataView;

  var defaults = {
    mapContainer: '#map',
    metadataLegendEl: '#legend-metadata',
    resultsLegendEl: '#legend-results',
    sidebarEl: '#sidebar'
  };

  var dispatcher = d3.dispatch('maptype');

  var renderMap = openelex.renderMap = function(options) {
    opts = _.defaults({}, options, defaults);

    mapdiv = d3.select(opts.mapContainer);
    toggle = d3.select(mapdiv[0][0].parentNode)
                     .insert('div', opts.metadataLegendEl)
                     .attr('id', 'toggle');
    metadataLegend = d3.select(opts.metadataLegendEl);
    resultsLegend = d3.select(opts.resultsLegendEl);
    statesCollection = options.states;
    statesCollection.once('sync', loadGeo);
    stateMetadataView = new openelex.StateMetadataView({
      el: opts.sidebarEl,
      collection: statesCollection,
    });

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

  /**
   * Load in GeoJSON data
   */
  function loadGeo() {
    d3.json("data/us-states.json", function(json) {
      geo = json;
      render();
      renderToggle(toggle);
      setMapType('results');
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
        var state = statesCollection.findWhere({
          name: d.properties.name
        });
        if (state) {
          var metadataClass = 'metadata-' + (slugify(state.get('metadata_status')) || 'not-started');
          var resultsClass = 'results-' + (slugify(state.get('results_status')) || 'not-started');
          return metadataClass + " " + resultsClass;
        }
      })
      .attr("stroke", "white")
      .attr("stroke-width", 1)
      .on('mouseover', function(d) {
        stateMetadataView.setState(d.properties.name).render();
      })
      .on('click', function(d){
        window.open('/results#' + d.properties.postal.toLowerCase(), '_self')
      })


      ;
  }

  /**
   * Render the control that toggles between the metadata and results view.
   *
   * @param el {d3.selection} el D3 selection for the container element where
   *   the toggle control will be rendered.
   */
  function renderToggle(el) {
    var resultsBtn = el.append('button')
      .attr('class', 'btn-toggle btn-results')
      .text("Data");
    var metaBtn = el.append('button')
      .attr('class', 'btn-toggle btn-metadata')
      .text("Metadata");

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
      metadataLegend.style('display', 'inline-block');
      resultsLegend.style('display', 'none');
      containerClasses = {
        'metadata': true,
        'results': false
      };
    }
    else {
      metadataLegend.style('display', 'none');
      resultsLegend.style('display', 'inline-block');
      containerClasses = {
        'metadata': false,
        'results': true
      };
    }

    body.classed(containerClasses);
    toggle.classed(containerClasses);
    mapdiv.classed(containerClasses);
    sidebar.classed(containerClasses);
  }

  dispatcher.on('maptype', setMapType);
})(window, document, _, d3, window.openelex || {});
