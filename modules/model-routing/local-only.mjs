/** Check at the transport boundary, not just at construction. No DNS names or redirects. */
export function localEndpoint(endpoint) {
  const url = new URL(endpoint);
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw Error('literal loopback Ollama endpoint required');
  return url.origin;
}

export function assertLocalWeights(metadata) {
  if (metadata?.remote_model || metadata?.remote_host || !metadata?.model_info?.['general.architecture']
      || !(metadata.model_info['general.parameter_count'] > 0))
    throw Error('ollama_local_model_unverified');
}

export function localModelFetch(endpoint, route, options = {}) {
  if (!['/api/show', '/api/chat', '/api/tags'].includes(route)) throw Error('local model route prohibited');
  return fetch(localEndpoint(endpoint) + route, {...options, redirect:'error'});
}
