/**
 * Phase 1.5 sub-phase 1.5b -- TypeScript shapes that mirror
 * the backend's Centrifugo admin resources
 * classes returned by `/api/v1/centrifugo/admin/*`. Field names match
 * the JSON-LD output one-for-one (camelCase per Symfony serializer).
 */

export interface CentrifugoNodeInfoDto {
    uid:         string;
    name:        string;
    version:     string;
    numClients:  number;
    numUsers:    number;
    numChannels: number;
    uptime:      number;
}

export interface CentrifugoNamespaceDto {
    name:        string;
    private:     boolean;
    historySize: number;
    historyTtl:  string;
    presence:    boolean;
}

export interface CentrifugoNamespacesListDto {
    namespaces: CentrifugoNamespaceDto[];
    count:      number;
}

export interface CentrifugoChannelsListDto {
    channels: string[];
    count:    number;
    pattern:  string | null;
}

/**
 * Centrifugo's presence map: keys are client ids (UUID issued by the
 * server at WebSocket handshake), values are the connect context the
 * server stored (user id from the JWT `sub`, any `info` claims, etc.).
 */
export interface CentrifugoChannelPresenceDto {
    channel:  string;
    presence: Record<string, CentrifugoPresenceEntry>;
    count:    number;
}

export interface CentrifugoPresenceEntry {
    user?:      string;
    client?:    string;
    conn_info?: unknown;
    chan_info?: unknown;
    [key: string]: unknown;
}

export interface CentrifugoChannelHistoryDto {
    channel:      string;
    publications: CentrifugoPublication[];
    count:        number;
    limit:        number;
    reverse:      boolean;
}

export interface CentrifugoPublication {
    data?:   unknown;
    offset?: number;
    tags?:   Record<string, string>;
    [key: string]: unknown;
}

export interface CentrifugoAdminPublishInput {
    channel: string;
    payload: Record<string, unknown>;
}

export interface CentrifugoAdminDisconnectInput {
    userId:    string;
    clientId?: string;
}
