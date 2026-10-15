export interface AlertMessage {
  title: string;
  body: string;
  url: string;
}

const TOKEN_RE = /^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]+\]$/;

export function isExpoPushToken(token: string): boolean {
  return TOKEN_RE.test(token);
}

/** Sends one notification through Expo's free push service. Throws if it is not accepted. */
export async function sendPush(token: string, msg: AlertMessage): Promise<void> {
  if (!isExpoPushToken(token)) {
    throw new Error('EXPO_PUSH_TOKEN is missing or not in the form ExponentPushToken[...]');
  }
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      to: token,
      title: msg.title,
      body: msg.body,
      sound: 'default',
      priority: 'high',
      data: { url: msg.url },
    }),
    signal: AbortSignal.timeout(20000),
  });
  const json = (await res.json().catch(() => null)) as {
    data?: { status?: string; message?: string; details?: { error?: string } };
    errors?: { message?: string }[];
  } | null;
  if (!res.ok || json?.data?.status !== 'ok') {
    const why =
      json?.data?.details?.error ?? json?.data?.message ?? json?.errors?.[0]?.message ?? `HTTP ${res.status}`;
    throw new Error(`Expo rejected the notification: ${why}`);
  }
}

export function alertMessage(headline: string, source: string, url: string): AlertMessage {
  const body = headline.length > 160 ? headline.slice(0, 157).trimEnd() + '…' : headline;
  return { title: `Breaking news · ${source}`, body, url };
}
