import Image from "next/image";
import { ChipRow, MainLink, PillLink, Screen, StaticChip } from "@/components/ui";
import styles from "./page.module.css";

// Screen 01: Home.
export default function Home() {
  return (
    <Screen
      footer={
        <>
          <MainLink href="/new" arrow>
            Create a lobby
          </MainLink>
          <PillLink href="/join" full>
            Join with a code
          </PillLink>
        </>
      }
    >
      <div className={styles.hero}>
        <Image
          src="/logo/pickle-logo-home.png"
          alt="Pickle logo"
          width={600}
          height={631}
          priority
          className={styles.logo}
        />
        <h1 className={styles.headline}>Decide where to go, together.</h1>
        <ChipRow>
          <StaticChip green>Food</StaticChip>
          <StaticChip green>Bars</StaticChip>
          <StaticChip green>Events</StaticChip>
        </ChipRow>
        <p className={styles.body}>Join with a code, pick one Yes and one No, then rank the options as a group.</p>
      </div>
    </Screen>
  );
}
