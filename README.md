# BSPoker

BSPoker is a minimalist, dark-themed, real-time multiplayer bluffing poker game for 2 to 8 players.
Every player starts with 2 cards, and each round also deals 2 community cards that everyone can see.
On your turn, you call a poker hand that ranks higher than the current call, or you call BS on the last call.
When someone calls BS, all cards are revealed and the called hand is checked against every dealt card.
If the hand exists, the player who called BS gets an extra card in later rounds.
If it does not exist, the player who called the hand gets the extra card.
A player who already holds 5 cards and loses is eliminated and becomes a spectator.
The last player left wins.

## Joining a game

1. Ask your host for the 4-letter game code.
2. Open the BSPoker site, for example `https://nlaud.github.io/BSPoker/`.
3. Enter your name and the code, then select "Join game".
4. Select "Ready". The match starts when every seated player is ready.

During a round, hold Space (or press and hold anywhere on a touch screen) to look at your cards.
On your turn, hold the BS button for one second to call BS, or select "Call a hand" and type a hand such as "pair of nines".

## Hosting a game

The host runs the game server on their own computer.
The server is the source of truth for the game, and the host also plays.

### One-time setup

1. Install [Node.js](https://nodejs.org/) 22 or later.
2. Install `cloudflared`, which makes your server reachable from other networks such as school wifi and cellular:
   - Windows: `winget install --id Cloudflare.cloudflared`
   - macOS: `brew install cloudflared`
   - Linux: see [the cloudflared downloads](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
3. Clone this repository and install its packages:

   ```sh
   git clone https://github.com/nlaud/BSPoker.git
   cd BSPoker
   npm install
   ```

### Each game night

1. In the repository folder, run:

   ```sh
   npm run host
   ```

2. The command prints a game code, for example `ABCD`, and opens your host page in your browser.
   To set your player name, add it to the command: `npm run host -- --name Nathan`.
3. Send the code to your friends. They open the BSPoker site and enter it.
4. Keep the terminal window open while you play. Press Ctrl+C to stop the server.

If the code does not work for a friend, send them the "Direct link" that the command also prints.
If everyone is on the same home wifi, `npm run host:lan` skips the public tunnel. Friends then open the "Same wifi" address that it prints.
Use `npm run host -- --port 9000` to use a port other than 8787.
Without `--name`, you join with the name that your browser last used on BSPoker, or "Host".

### How the connection works

- `npm run host` builds the game and starts a server on your computer at `http://localhost:8787`.
- `cloudflared` opens a free Cloudflare quick tunnel. Players connect to your server through a public `https://….trycloudflare.com` address on port 443, which most networks allow.
- The server posts that address to [ntfy.sh](https://ntfy.sh) under your game code. The BSPoker site looks up the code there to find your server. ntfy.sh only stores the address. Game data goes straight to your server.
- Only your host page has the host key, so only you can change lobby rules or remove offline players.
- When you stop the server, it marks the code as ended. A restart gets a new code.

## Development

1. Install packages with `npm install`.
2. Run `npm run host:lan` and open `http://localhost:8787` to play against the built client.
3. For hot reload of the client, run `npm run dev` and open `http://localhost:5173/?server=http://localhost:8787` while `npm run host:lan` runs.
4. Run the tests with `npm test`, check types with `npm run typecheck`, and lint with `npm run lint`.

## GitHub Pages deployment

The site deploys to GitHub Pages from `main` through GitHub Actions.
To turn it on, open the repository Settings, then Pages, and set the source to "GitHub Actions".

## Credits

Card audio samples courtesy of Kenney Casino Audio (CC0 1.0 Universal - kenney.nl).
