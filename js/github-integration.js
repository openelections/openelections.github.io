/**
 * GitHub API Integration for OpenElections
 * 
 * This module provides functionality to fetch repository information
 * from the GitHub API for displaying on individual state pages.
 */

class GitHubAPI {
  constructor(options = {}) {
    this.baseUrl = 'https://api.github.com';
    this.org = options.org || 'openelections';
    this.cache = new Map();
    this.cacheTimeout = options.cacheTimeout || 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Fetch all repositories for the OpenElections organization
   * @returns {Promise<Array>} Array of repository objects
   */
  async fetchAllRepositories() {
    const cacheKey = 'all-repos';
    
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }
    }

    try {
      const response = await fetch(`${this.baseUrl}/orgs/${this.org}/repos?type=all&sort=updated&per_page=100`);
      
      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }
      
      const repos = await response.json();
      
      // Cache the results
      this.cache.set(cacheKey, {
        data: repos,
        timestamp: Date.now()
      });
      
      return repos;
    } catch (error) {
      console.error('Error fetching repositories:', error);
      throw error;
    }
  }

  /**
   * Filter repositories by state abbreviation
   * @param {Array} repos - Array of repository objects
   * @param {string} stateAbbr - State abbreviation (e.g., 'md', 'ca')
   * @returns {Array} Filtered repositories for the state
   */
  filterRepositoriesByState(repos, stateAbbr) {
    const stateLower = stateAbbr.toLowerCase();
    
    return repos.filter(repo => {
      const name = repo.name.toLowerCase();
      
      // Look for repositories that contain the state abbreviation
      // Common patterns: openelections-data-md, openelections-sources-ca, etc.
      return name.includes(`-${stateLower}`) || 
             name.includes(`${stateLower}-`) ||
             name.endsWith(`-${stateLower}`) ||
             name.startsWith(`${stateLower}-`);
    });
  }

  /**
   * Get repository statistics
   * @param {string} repoName - Repository name
   * @returns {Promise<Object>} Repository statistics
   */
  async getRepositoryStats(repoName) {
    const cacheKey = `stats-${repoName}`;
    
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }
    }

    try {
      const [repoResponse, commitsResponse] = await Promise.all([
        fetch(`${this.baseUrl}/repos/${this.org}/${repoName}`),
        fetch(`${this.baseUrl}/repos/${this.org}/${repoName}/commits?per_page=1`)
      ]);

      if (!repoResponse.ok) {
        throw new Error(`Failed to fetch repository: ${repoResponse.status}`);
      }

      const repo = await repoResponse.json();
      
      // Get latest commit info if available
      let latestCommit = null;
      if (commitsResponse.ok) {
        const commits = await commitsResponse.json();
        latestCommit = commits[0] || null;
      }

      const stats = {
        name: repo.name,
        description: repo.description,
        html_url: repo.html_url,
        updated_at: repo.updated_at,
        created_at: repo.created_at,
        size: repo.size,
        language: repo.language,
        open_issues_count: repo.open_issues_count,
        forks_count: repo.forks_count,
        stargazers_count: repo.stargazers_count,
        default_branch: repo.default_branch,
        latest_commit: latestCommit ? {
          sha: latestCommit.sha.substring(0, 7),
          message: latestCommit.commit.message,
          date: latestCommit.commit.author.date,
          author: latestCommit.commit.author.name
        } : null
      };

      // Cache the results
      this.cache.set(cacheKey, {
        data: stats,
        timestamp: Date.now()
      });

      return stats;
    } catch (error) {
      console.error(`Error fetching stats for ${repoName}:`, error);
      throw error;
    }
  }

  /**
   * Get comprehensive state repository information
   * @param {string} stateAbbr - State abbreviation
   * @returns {Promise<Object>} State repository information
   */
  async getStateRepositories(stateAbbr) {
    try {
      const allRepos = await this.fetchAllRepositories();
      const stateRepos = this.filterRepositoriesByState(allRepos, stateAbbr);
      
      // Get detailed stats for each repository
      const repoDetails = await Promise.all(
        stateRepos.map(async (repo) => {
          try {
            return await this.getRepositoryStats(repo.name);
          } catch (error) {
            console.warn(`Failed to get stats for ${repo.name}:`, error);
            return {
              name: repo.name,
              description: repo.description,
              html_url: repo.html_url,
              updated_at: repo.updated_at,
              error: 'Failed to load detailed stats'
            };
          }
        })
      );

      return {
        state: stateAbbr.toUpperCase(),
        repositories: repoDetails,
        total_repositories: repoDetails.length,
        last_updated: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Error getting repositories for ${stateAbbr}:`, error);
      throw error;
    }
  }
}

// Repository display component
class StateRepositoryDisplay {
  constructor(containerId, githubAPI) {
    this.container = document.getElementById(containerId);
    this.githubAPI = githubAPI;
    this.currentState = null;
  }

  /**
   * Render repository information for a state
   * @param {string} stateAbbr - State abbreviation
   */
  async displayStateRepositories(stateAbbr) {
    if (!this.container) {
      console.error('Container element not found');
      return;
    }

    this.currentState = stateAbbr;
    this.showLoading();

    try {
      const stateData = await this.githubAPI.getStateRepositories(stateAbbr);
      this.renderRepositories(stateData);
    } catch (error) {
      this.showError(error);
    }
  }

  showLoading() {
    this.container.innerHTML = `
      <div class="github-repos-loading">
        <div class="d-flex align-items-center">
          <div class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></div>
          <span>Loading repository information...</span>
        </div>
      </div>
    `;
  }

  showError(error) {
    this.container.innerHTML = `
      <div class="github-repos-error alert alert-warning">
        <h6><i class="fas fa-exclamation-triangle me-2"></i>Unable to load repository information</h6>
        <p class="mb-0 small">Please try again later or visit <a href="https://github.com/openelections" target="_blank" rel="noopener">GitHub directly</a>.</p>
      </div>
    `;
  }

  renderRepositories(stateData) {
    if (!stateData.repositories || stateData.repositories.length === 0) {
      this.container.innerHTML = `
        <div class="github-repos-empty alert alert-info">
          <h6><i class="fab fa-github me-2"></i>No repositories found</h6>
          <p class="mb-0">No specific repositories found for ${stateData.state}. Check the <a href="https://github.com/openelections" target="_blank" rel="noopener">main organization page</a> for all repositories.</p>
        </div>
      `;
      return;
    }

    const reposHtml = stateData.repositories.map(repo => this.renderRepository(repo)).join('');
    
    this.container.innerHTML = `
      <div class="github-repos-container">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h5 class="mb-0">
            <i class="fab fa-github me-2"></i>
            ${stateData.state} Repositories (${stateData.total_repositories})
          </h5>
          <a href="https://github.com/openelections" class="btn btn-outline-primary btn-sm" target="_blank" rel="noopener">
            <i class="fas fa-external-link-alt me-1"></i>View All
          </a>
        </div>
        <div class="github-repos-grid">
          ${reposHtml}
        </div>
        <div class="github-repos-footer mt-3">
          <small class="text-muted">
            <i class="fas fa-clock me-1"></i>
            Last updated: ${new Date(stateData.last_updated).toLocaleString()}
          </small>
        </div>
      </div>
    `;
  }

  renderRepository(repo) {
    const updatedDate = new Date(repo.updated_at).toLocaleDateString();
    const languageIcon = this.getLanguageIcon(repo.language);
    
    return `
      <div class="github-repo-card card-modern">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <h6 class="repo-name mb-1">
            <a href="${repo.html_url}" target="_blank" rel="noopener" class="text-decoration-none">
              ${repo.name}
            </a>
          </h6>
          ${repo.language ? `<span class="badge bg-secondary">${languageIcon} ${repo.language}</span>` : ''}
        </div>
        
        ${repo.description ? `<p class="repo-description text-muted small mb-2">${repo.description}</p>` : ''}
        
        <div class="repo-stats d-flex gap-3 mb-2">
          ${repo.stargazers_count !== undefined ? `<span class="small"><i class="fas fa-star text-warning"></i> ${repo.stargazers_count}</span>` : ''}
          ${repo.forks_count !== undefined ? `<span class="small"><i class="fas fa-code-branch text-info"></i> ${repo.forks_count}</span>` : ''}
          ${repo.open_issues_count !== undefined ? `<span class="small"><i class="fas fa-exclamation-circle text-danger"></i> ${repo.open_issues_count}</span>` : ''}
        </div>
        
        ${repo.latest_commit ? `
          <div class="repo-latest-commit mb-2">
            <small class="text-muted">
              Latest: <code>${repo.latest_commit.sha}</code> by ${repo.latest_commit.author}
              <br>
              <time datetime="${repo.latest_commit.date}">${new Date(repo.latest_commit.date).toLocaleDateString()}</time>
            </small>
          </div>
        ` : ''}
        
        <div class="repo-footer d-flex justify-content-between align-items-center">
          <small class="text-muted">Updated ${updatedDate}</small>
          <a href="${repo.html_url}" class="btn btn-sm btn-outline-primary" target="_blank" rel="noopener">
            <i class="fas fa-external-link-alt"></i>
          </a>
        </div>
      </div>
    `;
  }

  getLanguageIcon(language) {
    const icons = {
      'Python': '<i class="fab fa-python"></i>',
      'JavaScript': '<i class="fab fa-js"></i>',
      'HTML': '<i class="fab fa-html5"></i>',
      'CSS': '<i class="fab fa-css3-alt"></i>',
      'Shell': '<i class="fas fa-terminal"></i>',
      'Ruby': '<i class="fas fa-gem"></i>',
      'Jupyter Notebook': '<i class="fas fa-file-code"></i>'
    };
    
    return icons[language] || '<i class="fas fa-code"></i>';
  }
}

// Initialize when DOM is ready
if (typeof window !== 'undefined') {
  window.GitHubAPI = GitHubAPI;
  window.StateRepositoryDisplay = StateRepositoryDisplay;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GitHubAPI, StateRepositoryDisplay };
}
