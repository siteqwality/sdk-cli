import { AuthenticatedClient, isUuid } from './api.js';

const uuid = (id, name) => {
  if (!isUuid(id)) throw new Error(`A valid ${name} UUID is required`);
  return id;
};
const choice = (value, choices, name) => {
  if (!choices.includes(value)) throw new Error(`${name} must be ${choices.join(', ')}`);
  return value;
};

export class IncidentClient extends AuthenticatedClient {
  async listIncidents({ status = 'active', limit = 50, offset = 0 } = {}) {
    choice(status, ['active', 'resolved', 'all'], 'status');
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new Error('limit must be 1 to 100');
    if (!Number.isSafeInteger(offset) || offset < 0)
      throw new Error('offset must be a non-negative integer');
    const query = new URLSearchParams({ status, limit: String(limit), offset: String(offset) });
    const result = await this.accountApi(`/incident?${query}`, 'GET', undefined, true);
    if (!Array.isArray(result.data) || !Number.isSafeInteger(result.total) || result.total < 0)
      throw new Error('Invalid incident list response');
    return { data: result.data, total: result.total };
  }
  acknowledgeIncident(id, acknowledgedBy) {
    uuid(id, 'incident');
    uuid(acknowledgedBy, 'acknowledging member');
    return this.accountApi(
      `/incident/${id}/acknowledge`,
      'POST',
      { acknowledged_by: acknowledgedBy },
      false,
      0,
    );
  }
  resolveIncident(id, { message, notifySubscribers = true } = {}) {
    uuid(id, 'incident');
    if (message !== undefined && (typeof message !== 'string' || !message.trim()))
      throw new Error('Resolution message must not be blank');
    if (typeof notifySubscribers !== 'boolean')
      throw new Error('notifySubscribers must be boolean');
    return this.accountApi(
      `/incident/${id}/resolve`,
      'POST',
      {
        ...(message === undefined ? {} : { message }),
        notify_subscribers: notifySubscribers,
      },
      false,
      0,
    );
  }
  updateIncident(id, { title, severity, serviceId } = {}) {
    uuid(id, 'incident');
    const body = {};
    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) throw new Error('Title must not be blank');
      body.title = title;
    }
    if (severity !== undefined)
      body.severity = choice(severity, ['minor', 'major', 'critical'], 'severity');
    if (serviceId !== undefined)
      body.service_id = serviceId === null ? null : uuid(serviceId, 'service');
    if (!Object.keys(body).length) throw new Error('Choose a title, severity or service change');
    return this.accountApi(`/incident/${id}`, 'PUT', body, false, 0);
  }
}
