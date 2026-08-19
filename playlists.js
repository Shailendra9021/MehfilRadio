/* =====================================================================
   PLAYLISTS.JS — this is the only file you should need to edit day-to-day.

   Each playlist looks like this:

   {
     id: "unique-short-id",       // no spaces, used in the URL (#/playlist/id)
     name: "Display Name",
     description: "One line shown under the playlist title",
     songs: [
       { id: "YOUTUBE_VIDEO_ID", title: "Song Name", artist: "Singer / Movie" },
       ...
     ]
   }

   HOW TO GET THE YOUTUBE_VIDEO_ID:
   From a URL like https://www.youtube.com/watch?v=XXXXXXXXXXX
   the ID is the part after "v=" -> XXXXXXXXXXX  (always 11 characters)

   You do NOT need to give a thumbnail — it's generated automatically from
   the video id (https://i.ytimg.com/vi/<id>/hqdefault.jpg).

   To add a new playlist later, just copy this whole block (including the
   curly braces) and paste it inside the PLAYLISTS array below, then edit
   id / name / description / songs:

   {
     id: "new-playlist-id",
     name: "New Playlist Name",
     description: "One line description",
     songs: [
       { id: "XXXXXXXXXXX", title: "Song Title", artist: "Singer - Movie" }
     ]
   },
===================================================================== */

const PLAYLISTS = [
  {
    id: "bollywood-romance",
    name: "Bollywood Romance",
    description: "90s romantic classics — batch 1, more being added.",
    songs: [
      { id: "w2iozAbNXAo", title: "Pehla Pehla Pyar Hai", artist: "S. P. Balasubrahmanyam - Hum Aapke Hain Koun" },
      { id: "mEc3p-KSMnY", title: "Dil Ne Yeh Kaha Hain Dil Se", artist: "Alka Yagnik, Kumar Sanu, Udit Narayan - Dhadkan" },
      { id: "-ijfNEF7-JY", title: "Kuch Kuch Hota Hai (Title Track)", artist: "Alka Yagnik, Udit Narayan - Kuch Kuch Hota Hai" },
      { id: "EhOQvAe6bfM", title: "Jab Koi Baat Bigad Jaye", artist: "Kumar Sanu, Sadhana Sargam - Jurm" },
      { id: "1eSG6dLiYxY", title: "Chura Ke Dil Mera", artist: "Alka Yagnik, Kumar Sanu - Main Khiladi Tu Anari" }
    ]
  }
];
