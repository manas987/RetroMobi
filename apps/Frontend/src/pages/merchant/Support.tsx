import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { MerchantLayout, useMerchantShop } from "./Layout";
import type { Row } from "../../lib/portal";
import { useT } from "../../i18n";
import { useMerchantQuery, useUrlString } from "./query";
import { Button, Card, EmptyState, ErrorNote, LoadingRows, PageHeader } from "./ui/ui";
import { ConversationList } from "./support/ConversationList";
import { Chat } from "./support/Chat";
import { NewChatSheet } from "./support/NewChatSheet";

function SupportBody() {
  const { token } = useMerchantShop();
  const { t } = useT();
  const [chat, setChat] = useUrlString("chat");
  const [booking, setBooking] = useUrlString("booking");
  const [newOpen, setNewOpen] = useState(false);
  const q = useMerchantQuery<{ tickets: Row[] }>("/tickets", token, { refetchInterval: 30_000 });

  return (
    <>
      <PageHeader
        title={t("nav.support")}
        subtitle={t("support.subtitle")}
        actions={<Button variant="primary" icon={MessageCircle} onClick={() => setNewOpen(true)}>{t("support.startChat")}</Button>}
      />
      {q.isPending ? <LoadingRows /> : q.isError ? <ErrorNote onRetry={() => q.refetch()} /> : (
        <div className="lg:flex lg:gap-4 lg:items-start">
          <div className={`${chat ? "hidden lg:block" : ""} lg:w-96 lg:shrink-0`}>
            <Card scroll className="lg:h-[calc(100dvh-10rem)]">
              <ConversationList tickets={q.data.tickets} activeId={chat} onOpen={setChat} />
            </Card>
          </div>
          {chat ? <div className="lg:flex-1 min-w-0"><Chat key={chat} ticketId={chat} onBack={() => setChat(null)} /></div>
            : q.data.tickets.length > 0 && <div className="hidden lg:block lg:flex-1"><Card><EmptyState icon={MessageCircle} text={t("support.pickOne")} /></Card></div>}
        </div>
      )}
      <NewChatSheet
        open={newOpen || !!booking}
        bookingId={booking}
        onClose={() => { setNewOpen(false); setBooking(null); }}
        onCreated={(id) => { setNewOpen(false); setBooking(null); setChat(id); }}
      />
    </>
  );
}

export function MerchantSupport() {
  return <MerchantLayout><SupportBody /></MerchantLayout>;
}
