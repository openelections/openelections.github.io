/**
 * OpenElections GitHub Activity Page
 * Displays recent commits and activity from the OpenElections organization
 * Uses Jekyll environment variables for configuration
 */

class GitHubActivityAPI {
  constructor(config = {}) {
    this.config = {
      organization: 'openelections',
      apiToken: '',
      apiVersion: '2022-11-28',
      baseUrl: 'https://api.github.com',
      cacheTimeout: 5 * 60 * 1000, // 5 minutes
      itemsPerPage: 20,
      maxConcurrentRequests: 3,
      debug: false,
      ...config
    };

    this.cache = new Map();
    this.activeRequests = new Set();
    this.rateLimitInfo = {
      remaining: null,
      reset: null,
      limit: null
    };
  }

  /**
   * Get headers for API requests
   */
  getHeaders() {
    const headers = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': this.config.apiVersion
    };

    if (this.config.apiToken) {
      headers['Authorization'] = `Bearer ${this.config.apiToken}`;
    }

    return headers;
  }

  /**
   * Check if cached data is still valid
   */
  isCacheValid(cacheKey) {
    const cached = this.cache.get(cacheKey);
    if (!cached) return false;
    
    const now = Date.now();
    return (now - cached.timestamp) < this.config.cacheTimeout;
  }

  /**
   * Get from cache or null if invalid/missing
   */
  getFromCache(cacheKey) {
    if (this.isCacheValid(cacheKey)) {
      if (this.config.debug) {
        console.log(`Cache hit for ${cacheKey}`);
      }
      return this.cache.get(cacheKey).data;
    }
    return null;
  }

  /**
   * Store data in cache
   */
  setCache(cacheKey, data) {
    this.cache.set(cacheKey, {
      data: data,
      timestamp: Date.now()
    });
    
    if (this.config.debug) {
      console.log(`Cached data for ${cacheKey}`);
    }
  }

  /**
   * Make API request with error handling and caching
   */
  async makeRequest(endpoint, cacheKey = null) {
    // Check cache first
    if (cacheKey) {
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;
    }

    // Check rate limiting
    if (this.activeRequests.size >= this.config.maxConcurrentRequests) {
      throw new Error('Too many concurrent requests');
    }

    const url = `${this.config.baseUrl}${endpoint}`;
    const requestId = `${Date.now()}-${Math.random()}`;
    
    try {
      this.activeRequests.add(requestId);
      
      if (this.config.debug) {
        console.log(`Making request to: ${url}`);
      }

      const response = await fetch(url, {
        headers: this.getHeaders()
      });

      // Update rate limit info
      this.updateRateLimitInfo(response);

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error(`Rate limit exceeded. Try again after ${new Date(this.rateLimitInfo.reset * 1000)}`);
        }
        throw new Error(`GitHub API Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Cache the response
      if (cacheKey) {
        this.setCache(cacheKey, data);
      }

      return data;

    } catch (error) {
      if (this.config.debug) {
        console.error('API Request failed:', error);
      }
      throw error;
    } finally {
      this.activeRequests.delete(requestId);
    }
  }

  /**
   * Update rate limit information from response headers
   */
  updateRateLimitInfo(response) {
    const remaining = response.headers.get('X-RateLimit-Remaining');
    const reset = response.headers.get('X-RateLimit-Reset');
    const limit = response.headers.get('X-RateLimit-Limit');

    if (remaining !== null) this.rateLimitInfo.remaining = parseInt(remaining);
    if (reset !== null) this.rateLimitInfo.reset = parseInt(reset);
    if (limit !== null) this.rateLimitInfo.limit = parseInt(limit);

    if (this.config.debug) {
      console.log('Rate limit info:', this.rateLimitInfo);
    }
  }

  /**
   * Get organization events (includes commits, issues, PRs, etc.)
   */
  async getOrganizationEvents(page = 1, perPage = null) {
    const itemsPerPage = perPage || this.config.itemsPerPage;
    const cacheKey = `org-events-${page}-${itemsPerPage}`;
    
    return this.makeRequest(
      `/orgs/${this.config.organization}/events?page=${page}&per_page=${itemsPerPage}`,
      cacheKey
    );
  }

  /**
   * Get all repositories for the organization
   */
  async getOrganizationRepositories(type = 'all', sort = 'updated') {
    const cacheKey = `org-repos-${type}-${sort}`;
    
    return this.makeRequest(
      `/orgs/${this.config.organization}/repos?type=${type}&sort=${sort}&per_page=100`,
      cacheKey
    );
  }

  /**
   * Get commits for a specific repository
   */
  async getRepositoryCommits(repoName, since = null, page = 1) {
    const sinceParam = since ? `&since=${since}` : '';
    const cacheKey = `repo-commits-${repoName}-${since || 'all'}-${page}`;
    
    return this.makeRequest(
      `/repos/${this.config.organization}/${repoName}/commits?page=${page}&per_page=${this.config.itemsPerPage}${sinceParam}`,
      cacheKey
    );
  }

  /**
   * Get multiple repositories' recent commits in parallel
   */
  async getMultipleRepoCommits(repoNames, since = null) {
    const promises = repoNames.map(repoName => 
      this.getRepositoryCommits(repoName, since, 1).catch(error => {
        console.warn(`Failed to get commits for ${repoName}:`, error);
        return [];
      })
    );

    const results = await Promise.all(promises);
    
    // Flatten and sort by commit date
    const allCommits = results.flat().sort((a, b) => 
      new Date(b.commit.committer.date) - new Date(a.commit.committer.date)
    );

    return allCommits;
  }

  /**
   * Get repository statistics
   */
  async getRepositoryStats(repoName) {
    const cacheKey = `repo-stats-${repoName}`;
    
    return this.makeRequest(
      `/repos/${this.config.organization}/${repoName}`,
      cacheKey
    );
  }

  /**
   * Search for commits across the organization
   */
  async searchCommits(query, sort = 'committer-date', order = 'desc') {
    const cacheKey = `search-commits-${btoa(query)}-${sort}-${order}`;
    
    return this.makeRequest(
      `/search/commits?q=${encodeURIComponent(query)}+org:${this.config.organization}&sort=${sort}&order=${order}`,
      cacheKey
    );
  }
}

class GitHubActivityDisplay {
  constructor(api, features = {}) {
    this.api = api;
    this.features = {
      enableCaching: true,
      enableSearch: true,
      enableFilters: true,
      showPrivateRepos: false,
      showStats: true,
      ...features
    };

    this.currentPage = 1;
    this.allEvents = [];
    this.filteredEvents = [];
    this.repositories = [];
    this.isLoading = false;
  }

  /**
   * Format relative time
   */
  formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString();
  }

  /**
   * Truncate text to specified length
   */
  truncateText(text, maxLength = 100) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + '...';
  }

  /**
   * Get event type icon
   */
  getEventTypeIcon(eventType) {
    const icons = {
      'PushEvent': 'fas fa-code-branch',
      'CreateEvent': 'fas fa-plus-circle',
      'DeleteEvent': 'fas fa-trash',
      'IssuesEvent': 'fas fa-exclamation-circle',
      'PullRequestEvent': 'fas fa-code-branch',
      'ReleaseEvent': 'fas fa-tag',
      'WatchEvent': 'fas fa-star',
      'ForkEvent': 'fas fa-code-branch'
    };
    
    return icons[eventType] || 'fas fa-circle';
  }

  /**
   * Render a single activity item
   */
  renderActivityItem(event) {
    const icon = this.getEventTypeIcon(event.type);
    const timeAgo = this.formatRelativeTime(event.created_at);
    const repoName = event.repo.name.replace(`${this.api.config.organization}/`, '');
    
    let content = '';
    let actionText = '';

    switch (event.type) {
      case 'PushEvent':
        const commitCount = event.payload.commits?.length || 0;
        actionText = `pushed ${commitCount} commit${commitCount !== 1 ? 's' : ''} to`;
        
        if (event.payload.commits && event.payload.commits.length > 0) {
          const firstCommit = event.payload.commits[0];
          content = `
            <div class="commit-message">
              "${this.truncateText(firstCommit.message, 80)}"
            </div>
            <div class="commit-details mt-1">
              <small class="text-muted">
                <code class="me-2">${firstCommit.sha.substring(0, 7)}</code>
                Branch: <span class="badge bg-secondary">${event.payload.ref.replace('refs/heads/', '')}</span>
              </small>
            </div>
          `;
        }
        break;

      case 'CreateEvent':
        const refType = event.payload.ref_type;
        actionText = `created ${refType}`;
        if (event.payload.ref) {
          content = `<span class="badge bg-success">${event.payload.ref}</span>`;
        }
        break;

      case 'IssuesEvent':
        actionText = `${event.payload.action} issue`;
        if (event.payload.issue) {
          content = `
            <div class="issue-title">
              <a href="${event.payload.issue.html_url}" target="_blank" rel="noopener">
                #${event.payload.issue.number}: ${this.truncateText(event.payload.issue.title, 60)}
              </a>
            </div>
          `;
        }
        break;

      case 'PullRequestEvent':
        actionText = `${event.payload.action} pull request`;
        if (event.payload.pull_request) {
          content = `
            <div class="pr-title">
              <a href="${event.payload.pull_request.html_url}" target="_blank" rel="noopener">
                #${event.payload.pull_request.number}: ${this.truncateText(event.payload.pull_request.title, 60)}
              </a>
            </div>
          `;
        }
        break;

      case 'ReleaseEvent':
        actionText = `${event.payload.action} release`;
        if (event.payload.release) {
          content = `
            <div class="release-title">
              <a href="${event.payload.release.html_url}" target="_blank" rel="noopener">
                <span class="badge bg-primary">${event.payload.release.tag_name}</span>
                ${this.truncateText(event.payload.release.name || '', 60)}
              </a>
            </div>
          `;
        }
        break;

      default:
        actionText = event.type.replace('Event', '').toLowerCase();
    }

    return `
      <div class="activity-item border-bottom py-3" data-event-type="${event.type}" data-repo="${repoName}">
        <div class="row align-items-start">
          <div class="col-auto">
            <div class="activity-icon">
              <i class="${icon} text-primary"></i>
            </div>
          </div>
          <div class="col">
            <div class="activity-content">
              <div class="activity-header d-flex align-items-center flex-wrap">
                <img src="${event.actor.avatar_url}" alt="${event.actor.login}" class="avatar-sm rounded-circle me-2" width="24" height="24">
                <strong class="me-2">
                  <a href="https://github.com/${event.actor.login}" target="_blank" rel="noopener" class="text-decoration-none">
                    ${event.actor.login}
                  </a>
                </strong>
                <span class="me-2">${actionText}</span>
                <a href="https://github.com/${event.repo.name}" target="_blank" rel="noopener" class="repo-link text-decoration-none">
                  <strong>${repoName}</strong>
                </a>
                <small class="text-muted ms-auto">${timeAgo}</small>
              </div>
              ${content}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render repository overview card
   */
  renderRepositoryCard(repo) {
    const updatedAgo = this.formatRelativeTime(repo.updated_at);
    const language = repo.language || 'Unknown';
    const languageColor = this.getLanguageColor(language);

    return `
      <div class="col-md-6 col-lg-4 mb-3">
        <div class="card h-100 repo-card" data-repo-type="${this.getRepositoryType(repo.name)}">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start mb-2">
              <h6 class="card-title mb-0">
                <a href="${repo.html_url}" target="_blank" rel="noopener" class="text-decoration-none">
                  ${repo.name.replace(`${this.api.config.organization}-`, '')}
                </a>
              </h6>
              <div class="repo-stats">
                <small class="text-muted">
                  <i class="fas fa-star"></i> ${repo.stargazers_count}
                  <i class="fas fa-code-branch ms-1"></i> ${repo.forks_count}
                </small>
              </div>
            </div>
            
            ${repo.description ? `<p class="card-text small text-muted mb-2">${this.truncateText(repo.description, 80)}</p>` : ''}
            
            <div class="d-flex justify-content-between align-items-center">
              <div class="language-info">
                <span class="language-dot" style="background-color: ${languageColor}"></span>
                <small class="text-muted">${language}</small>
              </div>
              <small class="text-muted">Updated ${updatedAgo}</small>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Get repository type based on name
   */
  getRepositoryType(repoName) {
    if (repoName.includes('-data-')) return 'data';
    if (repoName.includes('openelections-core') || repoName.includes('clarify')) return 'code';
    if (repoName.includes('docs') || repoName.includes('.github.io')) return 'docs';
    return 'other';
  }

  /**
   * Get language color for visual indicator
   */
  getLanguageColor(language) {
    const colors = {
      'Python': '#3572A5',
      'JavaScript': '#f1e05a',
      'TypeScript': '#2b7489',
      'HTML': '#e34c26',
      'CSS': '#563d7c',
      'Ruby': '#701516',
      'Shell': '#89e051',
      'R': '#198CE7',
      'Jupyter Notebook': '#DA5B0B'
    };
    
    return colors[language] || '#666666';
  }

  /**
   * Update statistics display
   */
  updateStats(repositories, events) {
    const totalRepos = repositories.length;
    const recentCommits = events.filter(e => e.type === 'PushEvent').length;
    const activeRepos = new Set(events.map(e => e.repo.name)).size;
    const contributors = new Set(events.map(e => e.actor.login)).size;

    document.getElementById('total-repos').textContent = totalRepos;
    document.getElementById('recent-commits').textContent = recentCommits;
    document.getElementById('active-repos').textContent = activeRepos;
    document.getElementById('contributors').textContent = contributors;
  }

  /**
   * Filter events based on current filter settings
   */
  filterEvents() {
    const searchTerm = document.getElementById('activity-search')?.value.toLowerCase() || '';
    const repoFilter = document.getElementById('repository-filter')?.value || '';
    const timeFilter = document.getElementById('time-filter')?.value || '7d';

    let filtered = [...this.allEvents];

    // Time filter
    if (timeFilter !== 'all') {
      const cutoffTime = new Date();
      switch (timeFilter) {
        case '24h':
          cutoffTime.setHours(cutoffTime.getHours() - 24);
          break;
        case '7d':
          cutoffTime.setDate(cutoffTime.getDate() - 7);
          break;
        case '30d':
          cutoffTime.setDate(cutoffTime.getDate() - 30);
          break;
      }
      
      filtered = filtered.filter(event => 
        new Date(event.created_at) >= cutoffTime
      );
    }

    // Repository type filter
    if (repoFilter) {
      filtered = filtered.filter(event => {
        const repoName = event.repo.name;
        return this.getRepositoryType(repoName) === repoFilter;
      });
    }

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(event => {
        const searchableText = [
          event.actor.login,
          event.repo.name,
          event.type,
          event.payload.commits?.map(c => c.message).join(' ') || '',
          event.payload.issue?.title || '',
          event.payload.pull_request?.title || ''
        ].join(' ').toLowerCase();
        
        return searchableText.includes(searchTerm);
      });
    }

    this.filteredEvents = filtered;
    this.renderActivity();
  }

  /**
   * Render the activity list
   */
  renderActivity() {
    const container = document.getElementById('activity-list');
    const noActivity = document.getElementById('no-activity');
    
    if (this.filteredEvents.length === 0) {
      container.classList.add('d-none');
      noActivity.classList.remove('d-none');
      return;
    }

    container.classList.remove('d-none');
    noActivity.classList.add('d-none');

    const eventsToShow = this.filteredEvents.slice(0, this.currentPage * this.api.config.itemsPerPage);
    container.innerHTML = eventsToShow.map(event => this.renderActivityItem(event)).join('');

    // Show/hide load more button
    const loadMoreContainer = document.getElementById('load-more-container');
    if (eventsToShow.length < this.filteredEvents.length) {
      loadMoreContainer.classList.remove('d-none');
    } else {
      loadMoreContainer.classList.add('d-none');
    }
  }

  /**
   * Render repository overview
   */
  renderRepositoryOverview() {
    const container = document.getElementById('repository-overview');
    
    if (this.repositories.length === 0) {
      container.innerHTML = '<p class="text-muted text-center">No repositories found.</p>';
      return;
    }

    // Sort repositories by recent activity
    const sortedRepos = [...this.repositories].sort((a, b) => 
      new Date(b.updated_at) - new Date(a.updated_at)
    );

    const repoCards = sortedRepos.slice(0, 12).map(repo => this.renderRepositoryCard(repo)).join('');
    container.innerHTML = `<div class="row">${repoCards}</div>`;
  }

  /**
   * Show loading state
   */
  showLoading() {
    document.getElementById('activity-loading').classList.remove('d-none');
    document.getElementById('activity-error').classList.add('d-none');
    document.getElementById('activity-list').classList.add('d-none');
    this.isLoading = true;
  }

  /**
   * Show error state
   */
  showError(message = 'Unable to load GitHub activity') {
    document.getElementById('activity-loading').classList.add('d-none');
    document.getElementById('activity-error').classList.remove('d-none');
    document.getElementById('activity-list').classList.add('d-none');
    
    const errorAlert = document.querySelector('#activity-error .alert p');
    if (errorAlert) {
      errorAlert.textContent = message;
    }
    
    this.isLoading = false;
  }

  /**
   * Hide loading state
   */
  hideLoading() {
    document.getElementById('activity-loading').classList.add('d-none');
    document.getElementById('activity-error').classList.add('d-none');
    this.isLoading = false;
  }

  /**
   * Load more activity events
   */
  async loadMore() {
    if (this.isLoading) return;

    try {
      this.currentPage++;
      const newEvents = await this.api.getOrganizationEvents(this.currentPage);
      this.allEvents.push(...newEvents);
      this.filterEvents();
    } catch (error) {
      console.error('Failed to load more events:', error);
      this.currentPage--; // Revert page increment
    }
  }
}

class GitHubActivityPage {
  constructor() {
    // Get configuration from global variables set by Jekyll
    const config = window.GitHubConfig || {};
    const features = window.GitHubFeatures || {};

    this.api = new GitHubActivityAPI(config);
    this.display = new GitHubActivityDisplay(this.api, features);
    
    this.isInitialized = false;
  }

  /**
   * Initialize the activity page
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      this.setupEventListeners();
      await this.loadInitialData();
      this.isInitialized = true;
      
      if (this.api.config.debug) {
        console.log('GitHub Activity Page initialized successfully');
      }
    } catch (error) {
      console.error('Failed to initialize GitHub Activity Page:', error);
      this.display.showError('Failed to initialize GitHub activity. Please refresh the page.');
    }
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Search input
    const searchInput = document.getElementById('activity-search');
    if (searchInput) {
      let searchTimeout;
      searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => this.display.filterEvents(), 300);
      });
    }

    // Filter dropdowns
    const repoFilter = document.getElementById('repository-filter');
    const timeFilter = document.getElementById('time-filter');
    
    if (repoFilter) {
      repoFilter.addEventListener('change', () => this.display.filterEvents());
    }
    
    if (timeFilter) {
      timeFilter.addEventListener('change', () => this.display.filterEvents());
    }

    // Load more button
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', () => this.display.loadMore());
    }

    // Refresh button
    const refreshBtn = document.getElementById('refresh-activity');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.refresh());
    }
  }

  /**
   * Load initial data
   */
  async loadInitialData() {
    this.display.showLoading();

    try {
      // Load repositories and events in parallel
      const [repositories, events] = await Promise.all([
        this.api.getOrganizationRepositories('public', 'updated'),
        this.api.getOrganizationEvents(1)
      ]);

      this.display.repositories = repositories;
      this.display.allEvents = events;
      this.display.filteredEvents = [...events];

      this.display.hideLoading();
      this.display.updateStats(repositories, events);
      this.display.renderActivity();
      this.display.renderRepositoryOverview();

    } catch (error) {
      console.error('Failed to load initial data:', error);
      this.display.showError(error.message);
    }
  }

  /**
   * Refresh all data
   */
  async refresh() {
    // Clear cache
    this.api.cache.clear();
    
    // Reset pagination
    this.display.currentPage = 1;
    
    // Reload data
    await this.loadInitialData();
  }

  /**
   * Retry loading after an error
   */
  async retry() {
    await this.refresh();
  }
}
