import { useCallback, useRef, useState } from "react";
import { FlatList, Linking, Pressable, StyleSheet, View } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";
import { ArrowUpRight, FileText, Paperclip, RotateCw, Send, X } from "lucide-react-native";
import {
  Button, ErrorNote, Input, LoadingRows, Screen, Text, api, colors, dateLabel, errorMessage, formatIstTime, istDay, radius, space, uploadFile,
  useSession, decodeJwtSubject, type PickedFile,
} from "@retromobi/mobile-shared";
import { Card, EmptyState, IconAction } from "../../features/RiderSurface";
import { canPreviewImage, messageCaption, senderLabel, ticketTitle, type Attachment, type Message, type Ticket } from "../../features/support/tickets";
import { useDiscardChanges } from "../../state/discard";
import { refreshRiderData, usePrivate, useWrite } from "../../state/private";

export default function Chat() {
  const { ticketId } = useLocalSearchParams<{ ticketId: string }>();
  const session = useSession();
  const router = useRouter();
  return <>
    <Stack.Screen options={{ title: "RetroMobi Support" }} />
    {!session ? <Screen edges={["left", "right", "bottom"]}><Button label="Sign in" onPress={() => router.push("/login")} /></Screen>
      : !ticketId ? <Screen><EmptyState title="Conversation not found" text="Open a conversation from Support."
        action={<Button label="Go to Support" onPress={() => router.replace("/support")} />} /></Screen>
      : <ChatThread key={ticketId} id={ticketId} userId={decodeJwtSubject(session.accessToken)} />}
  </>;
}

function ChatThread({ id, userId }: { id: string; userId: string | null }) {
  const base = `/tickets/${encodeURIComponent(id)}`;
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const ticket = usePrivate<Ticket>(base, focused ? 10_000 : undefined);
  const q = usePrivate<{ messages: Message[] }>(ticket.isSuccess ? `${base}/messages` : null, focused ? 4_000 : undefined);
  const [body, setBody] = useState("");
  const [file, setFile] = useState<PickedFile>();
  const [posted, setPosted] = useState("");
  const [sendingFile, setSendingFile] = useState(false);
  const list = useRef<FlatList<Message>>(null);
  const follow = useRef(true);
  const w = useWrite();
  const discard = useDiscardChanges(!!body.trim() || !!file, w.busy && sendingFile);
  const download = useWrite();
  const messages = q.data?.messages ?? [];
  const closed = ticket.data?.status === "RESOLVED";

  function choose() {
    void w.run(async () => {
      const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      const a = picked.canceled ? null : picked.assets[0];
      if (a) setFile({ uri: a.uri, mimeType: a.mimeType ?? "application/octet-stream", name: a.name, size: a.size });
    });
  }

  function send() {
    if ((!body.trim() && !file) || closed) return;
    void w.run(async () => {
      let messageId = posted;
      try {
        if (!messageId) {
          const result = await api<Message>(`${base}/messages`, { method: "POST", body: { body: body.trim() || `Attachment · ${file?.name ?? "File"}` } });
          if (!result?.id) throw new Error("Couldn’t read the response. Refresh the chat before trying again.");
          messageId = result.id;
          setBody("");
          if (file) setPosted(messageId);
        }
        if (file) {
          setSendingFile(true);
          const path = `${base}/messages/${encodeURIComponent(messageId)}/attachments`;
          try {
            await uploadFile({ file, presignPath: `${path}/upload`, confirmPath: `${path}/confirm`, confirmBody: { fileName: file.name, sizeBytes: file.size } });
          } catch {
            throw new Error("Your message was sent. Retry the attachment.");
          }
          setFile(undefined); setPosted("");
        }
      } finally {
        setSendingFile(false);
        if (messageId) {
          follow.current = true;
          void q.refetch();
          void refreshRiderData("/tickets");
        }
      }
    }, (err) => err instanceof Error ? err.message : "Couldn’t send the message.");
  }

  function open(attachment: Attachment) {
    void download.run(async () => {
      const { downloadUrl } = await api<{ downloadUrl: string }>(`${base}/attachments/${encodeURIComponent(attachment.id)}/download`);
      if (new URL(downloadUrl).protocol !== "https:") throw new Error("Couldn’t get a secure link to the attachment.");
      await Linking.openURL(downloadUrl);
    }, (err) => errorMessage(err, "Couldn’t open that attachment."));
  }

  return <Screen scroll={false} padded={false} edges={["left", "right", "bottom"]}
    footer={!closed && ticket.isSuccess && <View style={{ gap: space[2] }}>
      {w.error && <ErrorNote text={w.error} />}
      {file && !posted && <View style={styles.attachment}>
        <Paperclip size={18} color={colors.ink2} />
        <Text size="sm" numberOfLines={1} style={{ flex: 1 }}>{file.name}</Text>
        <IconAction icon={X} label="Remove attachment" disabled={w.busy} onPress={() => setFile(undefined)} />
      </View>}
      <View style={styles.composer}>
        {posted && file ? <View style={[styles.attachment, { flex: 1 }]}>
          <Paperclip size={18} color={colors.ink2} />
          <Text size="sm" numberOfLines={1} style={{ flex: 1 }}>{file.name}</Text>
          <IconAction icon={X} label="Remove attachment" disabled={w.busy} onPress={() => { setFile(undefined); setPosted(""); }} />
        </View> : <>
          <IconAction icon={Paperclip} label="Attach a file" disabled={w.busy || !!file} onPress={choose} />
          <Input accessibilityLabel="Your message" placeholder="Message" multiline value={body} onChangeText={setBody}
            editable={!w.busy} style={styles.messageInput} />
        </>}
        <IconAction icon={posted ? RotateCw : Send} label={sendingFile ? "Uploading attachment" : posted ? "Retry attachment" : "Send message"}
          primary busy={w.busy}
          disabled={!body.trim() && !file} onPress={send} />
      </View>
    </View>}>
    <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} ref={list} data={messages} keyExtractor={(item) => item.id} keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ flexGrow: 1, padding: space[4], gap: space[2] }} refreshing={q.isRefetching}
      onRefresh={() => { void ticket.refetch(); if (ticket.isSuccess) void q.refetch(); }}
      onScroll={({ nativeEvent: e }) => { follow.current = e.contentSize.height - (e.layoutMeasurement.height + e.contentOffset.y) < 120; }}
      onContentSizeChange={() => { if (follow.current && messages.length) list.current?.scrollToEnd({ animated: false }); }}
      ListHeaderComponent={<View style={{ gap: space[2] }}>
        {ticket.data?.booking_id && <Text size="sm" color="ink2">{ticketTitle(ticket.data)}</Text>}
        {ticket.data?.resolution && <Card title="Resolution"><Text>{ticket.data.resolution}</Text></Card>}
        {closed && !ticket.data?.resolution && <Text>This conversation has been resolved.</Text>}
        {(ticket.error || q.error) && <ErrorNote text={errorMessage(ticket.error ?? q.error)} onRetry={() => { void ticket.refetch(); if (ticket.isSuccess) void q.refetch(); }} />}
        {download.error && <ErrorNote text={download.error} />}
      </View>}
      ListEmptyComponent={ticket.isPending || (ticket.isSuccess && q.isPending) ? <LoadingRows label="Loading conversation" /> : q.isSuccess ? <EmptyState title="No messages yet"
        text={closed ? "This conversation is closed." : "Send a message or attach a file below."} /> : undefined}
      renderItem={({ item, index }) => {
        const before = messages[index - 1];
        const day = istDay(new Date(item.created_at));
        const newDay = !before || day !== istDay(new Date(before.created_at));
        const mine = item.sender_type === "CUSTOMER" && item.sender_id === userId;
        const newSpeaker = newDay || before?.sender_type !== item.sender_type || before?.sender_id !== item.sender_id;
        const caption = messageCaption(item);
        return <View style={{ gap: space[2] }}>
          {newDay && <Text style={styles.day} center size="xs" color="ink2">{dateLabel(day)}</Text>}
          <View style={[styles.message, mine ? styles.outgoing : styles.incoming, newSpeaker && { marginTop: space[1] }]}>
            {!mine && newSpeaker && <Text size="xs" weight="bold" color="ink2">{senderLabel(item.sender_type, false)}</Text>}
            {!!caption && <Text selectable>{caption}</Text>}
            {item.attachments?.map((attachment) => <AttachmentPreview key={attachment.id} attachment={attachment}
              path={`${base}/attachments/${encodeURIComponent(attachment.id)}/download`} onOpen={() => open(attachment)} disabled={download.busy} />)}
            <Text style={{ alignSelf: mine ? "flex-end" : "flex-start" }} size="xs" color="ink2">{formatIstTime(item.created_at)}</Text>
          </View>
        </View>;
      }} />
    {discard.dialog}
  </Screen>;
}

function AttachmentPreview({ attachment, path, onOpen, disabled }: { attachment: Attachment; path: string; onOpen: () => void; disabled: boolean }) {
  const q = usePrivate<{ downloadUrl: string }>(canPreviewImage(attachment) ? path : null);
  const uri = q.data?.downloadUrl;
  const [failedUrl, setFailedUrl] = useState<string>();
  const name = attachment.file_name ?? "Attachment";
  const showImage = typeof uri === "string" && /^https:\/\//i.test(uri) && uri !== failedUrl;
  return <Pressable onPress={onOpen} disabled={disabled} accessibilityRole="button" accessibilityLabel={`Open ${name}`}
    accessibilityState={{ disabled }} style={showImage ? styles.image : styles.file}>
    {showImage ? <Image source={uri} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="none"
      onError={() => setFailedUrl(uri)} accessible={false} />
      : <>
        <FileText size={18} color={colors.ink2} />
        <Text size="sm" weight="medium" style={{ flex: 1 }} numberOfLines={2}>{name}</Text>
        <ArrowUpRight size={16} color={colors.ink2} />
      </>}
  </Pressable>;
}

const styles = StyleSheet.create({
  composer: { flexDirection: "row", alignItems: "flex-end", gap: space[2] },
  messageInput: { flex: 1, maxHeight: 120, borderRadius: radius.sheet, borderColor: colors.line, backgroundColor: colors.surface2, paddingVertical: space[3] },
  attachment: { flexDirection: "row", alignItems: "center", gap: space[2], paddingLeft: space[3], backgroundColor: colors.surface2, borderRadius: radius.sheet },
  day: { alignSelf: "center", backgroundColor: colors.surface3, paddingHorizontal: space[3], paddingVertical: space[1], borderRadius: radius.full },
  message: { maxWidth: "88%", paddingHorizontal: space[3], paddingVertical: space[2], borderRadius: radius.panel, gap: space[1] },
  outgoing: { alignSelf: "flex-end", backgroundColor: `${colors.amber}55`, borderBottomRightRadius: 4 },
  incoming: { alignSelf: "flex-start", backgroundColor: colors.surface3, borderBottomLeftRadius: 4 },
  file: { minHeight: 48, width: 220, maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: space[2] },
  image: { width: 220, maxWidth: "100%", aspectRatio: 4 / 3, backgroundColor: colors.surface, borderRadius: radius.row, overflow: "hidden" },
});
