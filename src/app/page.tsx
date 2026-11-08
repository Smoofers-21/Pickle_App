import Image from "next/image";
import { MainButton, PillButton, Screen } from "@/components/ui";
import styles from "./page.module.css";

// Screen 01: Home. Creating and joining lobbies arrive in milestone 2.
export default function Home() {
  return (
    <Screen
      footer={
        <>
          <MainButton disabled disabledReason="Lobbies arrive in milestone 2">
            Create a lobby
          </MainButton>
          <PillButton full disabled>
            Join with a code
          </PillButton>
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
        <p className={styles.tagline}>Decide what to do with your friends in a few minutes.</p>
      </div>
    </Screen>
  );
}
