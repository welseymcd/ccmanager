// Simple API client with authentication support

class ApiClient {
  constructor() {
    // Using relative paths for API endpoints
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    const token = localStorage.getItem('auth_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    return headers;
  }

  async get(endpoint: string): Promise<Response> {
    return fetch(endpoint, {
      method: 'GET',
      headers: this.getHeaders(),
    });
  }

  async post(endpoint: string, data?: any): Promise<Response> {
    return fetch(endpoint, {
      method: 'POST',
      headers: this.getHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put(endpoint: string, data?: any): Promise<Response> {
    return fetch(endpoint, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete(endpoint: string): Promise<Response> {
    return fetch(endpoint, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
  }
}

export const api = new ApiClient();