// TeamSpeak ServerQuery Event Names
export const TS_EVENTS = {
  CLIENT_ENTER: 'notifycliententerview',
  CLIENT_LEFT: 'notifyclientleftview',
  CLIENT_MOVED: 'notifyclientmoved',
  CLIENT_UPDATED: 'notifyclientupdated',
  SERVER_EDITED: 'notifyserveredited',
  CHANNEL_EDITED: 'notifychanneledited',
  CHANNEL_DESCRIPTION_CHANGED: 'notifychanneldescriptionchanged',
  CHANNEL_CREATED: 'notifychannelcreated',
  CHANNEL_DELETED: 'notifychanneldeleted',
  CHANNEL_MOVED: 'notifychannelmoved',
  CHANNEL_PASSWORD_CHANGED: 'notifychannelpasswordchanged',
  TEXT_MESSAGE: 'notifytextmessage',
  TOKEN_USED: 'notifytokenused',
} as const;

export type TSEventName = (typeof TS_EVENTS)[keyof typeof TS_EVENTS];

export const TS_EVENT_LABELS: Record<string, string> = {
  [TS_EVENTS.CLIENT_ENTER]: 'Client Connected',
  [TS_EVENTS.CLIENT_LEFT]: 'Client Disconnected',
  [TS_EVENTS.CLIENT_MOVED]: 'Client Moved',
  [TS_EVENTS.CLIENT_UPDATED]: 'Client Status Updated',
  'client_went_away': 'Client Went Away',
  'client_came_back': 'Client Came Back',
  'client_mic_muted': 'Client Mic Muted',
  'client_mic_unmuted': 'Client Mic Unmuted',
  'client_sound_muted': 'Client Sound Muted',
  'client_sound_unmuted': 'Client Sound Unmuted',
  'client_mic_disabled': 'Client Mic HW Disabled',
  'client_mic_enabled': 'Client Mic HW Enabled',
  'client_sound_disabled': 'Client Sound HW Disabled',
  'client_sound_enabled': 'Client Sound HW Enabled',
  'client_group_added': 'Client Added to Group',
  'client_group_removed': 'Client Removed from Group',
  'client_recording_started': 'Client Recording Started',
  'client_recording_stopped': 'Client Recording Stopped',
  'client_nickname_changed': 'Client Nickname Changed',
  [TS_EVENTS.SERVER_EDITED]: 'Server Edited',
  [TS_EVENTS.CHANNEL_EDITED]: 'Channel Edited',
  [TS_EVENTS.CHANNEL_DESCRIPTION_CHANGED]: 'Channel Description Changed',
  [TS_EVENTS.CHANNEL_CREATED]: 'Channel Created',
  [TS_EVENTS.CHANNEL_DELETED]: 'Channel Deleted',
  [TS_EVENTS.CHANNEL_MOVED]: 'Channel Moved',
  [TS_EVENTS.CHANNEL_PASSWORD_CHANGED]: 'Channel Password Changed',
  [TS_EVENTS.TEXT_MESSAGE]: 'Text Message Received',
  [TS_EVENTS.TOKEN_USED]: 'Privilege Key Used',
};

// Event registration types for servernotifyregister
export const TS_EVENT_TYPES = ['server', 'channel', 'textserver', 'textchannel', 'textprivate'] as const;
