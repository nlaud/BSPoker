# BSPoker

BSPoker is a minimalist, dark-themed, real-time multiplayer bluffing poker web game for 2 to 8 players.
Every player starts with 2 cards, and in each round players are dealt their cards alongside 2 community cards that are visible to everyone.
On your turn, you must either call a hand that strictly ranks higher than the current call or call BS on the previous player's call.
When BS is called, all cards are revealed and checked against the called hand across every dealt player hand and both community cards.
If the called hand exists, the player who called BS gets an extra card for future rounds; otherwise, the player who made the bluff gets an extra card.
A player who already holds 5 cards and loses a challenge is eliminated and becomes a spectator.
The game continues clockwise until only one player remains alive as the winner.

## How to Play

Open the hosted GitHub Pages URL in your browser.
Enter your name and click "Create lobby" to host a game, or enter a 4-letter room code to join an existing table.
Share the lobby code or the invite link with your friends.
Once at least two seated players toggle their ready status, a 3-second countdown starts the match.
During the game, press and hold Space or touch and hold the table felt to peek at your private cards.

## Hosting Tips

We recommend hosting the lobby on a plugged-in laptop with the game tab kept active in the foreground.
A phone host may suspend WebRTC connections when the screen locks or when switching to other apps, which pauses the game for everyone.

## PeerJS Broker

The PeerJS broker server is only used to broker the initial WebRTC connection handshake between browsers.
All game state, actions, and card data travel directly peer-to-peer between client browsers and the host browser.
Players need access to the broker only when creating or joining a lobby.

## GitHub Pages Deployment

To enable deployment on GitHub, navigate to your repository Settings -> Pages.
Set the Build and deployment Source to "GitHub Actions".
If the repository is private, GitHub Pages requires a GitHub Pro or Team plan, or you can make the repository public.

## Local Development

Install dependencies with `npm install`.
Start the local PeerJS broker with `npm run peer`.
Start the Vite development server with `npm run dev`.
Open `http://localhost:5173/?peer=localhost:9000` to connect using the local broker.
Run the test suite with `npm test`, check types with `npm run typecheck`, and lint with `npm run lint`.

## Credits

Card audio samples courtesy of Kenney Casino Audio (CC0 1.0 Universal - kenney.nl).

