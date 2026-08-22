import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './supabase';
import './styles.css';


/* =========================================
   HILFSFUNKTIONEN
========================================= */

function formatDate(date) {
  if (!date) return '';

  return new Date(date).toLocaleDateString(
    'de-AT',
    {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    }
  );
}


function categoryLabel(category) {
  const labels = {
    NEWS: 'News',
    EVENT: 'Event',
    ANNOUNCEMENT: 'Ankündigung',
    COMMUNITY: 'Community'
  };

  return labels[category] || category;
}


/* =========================================
   AUTH
========================================= */

function Auth({ onClose, initialMode = 'login' }) {

  const [mode, setMode] = useState(initialMode);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    birth_date: '',
    nickname: '',
    email: '',
    password: ''
  });


  function setField(key, value) {
    setForm({
      ...form,
      [key]: value
    });
  }


  async function submit(e) {

    e.preventDefault();

    setLoading(true);
    setMessage('');

    let error;


    if (mode === 'register') {

      ({ error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,

        options: {
          emailRedirectTo: window.location.origin,

          data: {
            first_name: form.first_name,
            last_name: form.last_name,
            birth_date: form.birth_date,
            nickname: form.nickname
          }
        }
      }));


      setMessage(
        error
          ? error.message
          : 'Registrierung erfolgreich. Bitte bestätige deine E-Mail.'
      );

    } else {

      ({ error } =
        await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password
        }));


      setMessage(
        error
          ? error.message
          : 'Erfolgreich angemeldet.'
      );

    }

    setLoading(false);
  }


  return (

    <div className="modalBackdrop">

      <form
        className="authModal"
        onSubmit={submit}
      >

        <button
          type="button"
          className="close"
          onClick={onClose}
        >
          ×
        </button>


        <h2>
          {mode === 'login'
            ? 'Anmelden'
            : 'Mitglied werden'}
        </h2>


        {mode === 'register' && (
          <>

            <input
              required
              placeholder="Vorname"
              onChange={e =>
                setField(
                  'first_name',
                  e.target.value
                )
              }
            />


            <input
              required
              placeholder="Nachname"
              onChange={e =>
                setField(
                  'last_name',
                  e.target.value
                )
              }
            />


            <input
              required
              type="date"
              onChange={e =>
                setField(
                  'birth_date',
                  e.target.value
                )
              }
            />


            <input
              required
              minLength="3"
              placeholder="Nickname"
              onChange={e =>
                setField(
                  'nickname',
                  e.target.value
                )
              }
            />

          </>
        )}


        <input
          required
          type="email"
          placeholder="E-Mail-Adresse"
          onChange={e =>
            setField(
              'email',
              e.target.value
            )
          }
        />


        <input
          required
          minLength="8"
          type="password"
          placeholder="Passwort"
          onChange={e =>
            setField(
              'password',
              e.target.value
            )
          }
        />


        <button
          className="primary"
          disabled={loading}
        >
          {loading
            ? 'Bitte warten ...'
            : mode === 'login'
            ? 'Anmelden'
            : 'Registrieren'}
        </button>


        {message && (
          <div className="authMessage">
            {message}
          </div>
        )}


        <button
          type="button"
          className="switch"
          onClick={() =>
            setMode(
              mode === 'login'
                ? 'register'
                : 'login'
            )
          }
        >

          {mode === 'login'
            ? 'Noch kein Konto? Registrieren'
            : 'Bereits registriert? Anmelden'}

        </button>

      </form>

    </div>

  );
}


/* =========================================
   POST EDITOR
========================================= */

function PostEditor({
  post,
  onClose,
  onSaved,
  user
}) {

  const [form, setForm] = useState({
    title: post?.title || '',
    excerpt: post?.excerpt || '',
    content: post?.content || '',
    image_url: post?.image_url || '',
    category: post?.category || 'NEWS',
    event_date: post?.event_date
      ? post.event_date.slice(0, 16)
      : '',
    location: post?.location || '',
    status: post?.status || 'DRAFT',
    featured: post?.featured || false
  });

  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);


  function setField(key, value) {
    setForm({
      ...form,
      [key]: value
    });
  }


  async function save(statusOverride) {

    if (!form.title.trim()) {
      setMessage('Bitte gib einen Titel ein.');
      return;
    }

    setLoading(true);


    const data = {
      ...form,

      status:
        statusOverride ||
        form.status,

      event_date:
        form.category === 'EVENT' &&
        form.event_date
          ? new Date(
              form.event_date
            ).toISOString()
          : null,

      location:
        form.category === 'EVENT'
          ? form.location
          : null,

      updated_at:
        new Date().toISOString()
    };


    let error;


    if (post?.id) {

      ({ error } =
        await supabase
          .from('posts')
          .update(data)
          .eq('id', post.id));

    } else {

      ({ error } =
        await supabase
          .from('posts')
          .insert({
            ...data,
            author_id: user.id
          }));

    }


    if (error) {

      setMessage(error.message);
      setLoading(false);
      return;

    }


    onSaved();
    onClose();
  }


  return (

    <div className="modalBackdrop">

      <div className="editorModal">

        <button
          className="close"
          onClick={onClose}
        >
          ×
        </button>


        <h2>

          {post
            ? 'Beitrag bearbeiten'
            : 'Neuen Beitrag erstellen'}

        </h2>


        <label>
          Kategorie
        </label>

        <select
          value={form.category}
          onChange={e =>
            setField(
              'category',
              e.target.value
            )
          }
        >

          <option value="NEWS">
            📰 News
          </option>

          <option value="EVENT">
            📅 Event
          </option>

          <option value="ANNOUNCEMENT">
            📌 Ankündigung
          </option>

          <option value="COMMUNITY">
            🌿 Community
          </option>

        </select>


        <label>
          Titel
        </label>

        <input
          value={form.title}
          placeholder="Titel eingeben..."
          onChange={e =>
            setField(
              'title',
              e.target.value
            )
          }
        />


        <label>
          Kurzbeschreibung
        </label>

        <textarea
          value={form.excerpt}
          placeholder="Kurze Zusammenfassung..."
          onChange={e =>
            setField(
              'excerpt',
              e.target.value
            )
          }
        />


        <label>
          Vollständiger Inhalt
        </label>

        <textarea
          className="largeTextarea"
          value={form.content}
          placeholder="Hier kommt dein vollständiger Beitrag..."
          onChange={e =>
            setField(
              'content',
              e.target.value
            )
          }
        />


        <label>
          Bild-URL
        </label>

        <input
          value={form.image_url}
          placeholder="https://..."
          onChange={e =>
            setField(
              'image_url',
              e.target.value
            )
          }
        />


        {form.category === 'EVENT' && (
          <>

            <label>
              Datum und Uhrzeit
            </label>

            <input
              type="datetime-local"
              value={form.event_date}
              onChange={e =>
                setField(
                  'event_date',
                  e.target.value
                )
              }
            />


            <label>
              Ort
            </label>

            <input
              value={form.location}
              placeholder="z.B. Leoben"
              onChange={e =>
                setField(
                  'location',
                  e.target.value
                )
              }
            />

          </>
        )}


        <label className="checkboxLabel">

          <input
            type="checkbox"
            checked={form.featured}
            onChange={e =>
              setField(
                'featured',
                e.target.checked
              )
            }
          />

          Beitrag hervorheben

        </label>


        {message && (
          <div className="authMessage">
            {message}
          </div>
        )}


        <div className="editorActions">

          <button
            className="ghost"
            disabled={loading}
            onClick={() =>
              save('DRAFT')
            }
          >
            📝 Entwurf speichern
          </button>


          <button
            className="primary"
            disabled={loading}
            onClick={() =>
              save('PUBLISHED')
            }
          >
            🚀 Veröffentlichen
          </button>

        </div>

      </div>

    </div>

  );
}


/* =========================================
   POST CARD
========================================= */

function PostCard({
  post,
  admin,
  onEdit,
  onDelete
}) {

  const [expanded, setExpanded] = useState(false);


  return (

    <article
      className={`postCard ${post.featured ? 'featured' : ''}`}
    >

      {post.image_url && (
        <img
          className="postImage"
          src={post.image_url}
          alt={post.title}
        />
      )}


      <div className="postContent">

        <div className="postMeta">

          <span className={`category ${post.category}`}>
            {categoryLabel(post.category)}
          </span>


          <span>
            {formatDate(post.created_at)}
          </span>

        </div>


        <h3>
          {post.title}
        </h3>


        {post.excerpt && (
          <p className="excerpt">
            {post.excerpt}
          </p>
        )}


        {post.category === 'EVENT' && (

          <div className="eventInfo">

            {post.event_date && (
              <div>
                📅 {formatDate(post.event_date)}
              </div>
            )}

            {post.location && (
              <div>
                📍 {post.location}
              </div>
            )}

          </div>

        )}


        {expanded && post.content && (
          <div className="fullPost">
            {post.content}
          </div>
        )}


        {post.content && (
          <button
            className="readMore"
            onClick={() =>
              setExpanded(!expanded)
            }
          >
            {expanded
              ? 'Weniger anzeigen'
              : 'Mehr erfahren'}
          </button>
        )}


        {admin && (

          <div className="postAdminActions">

            <button
              onClick={() =>
                onEdit(post)
              }
            >
              ✏️ Bearbeiten
            </button>


            <button
              className="deleteButton"
              onClick={() =>
                onDelete(post.id)
              }
            >
              🗑️ Löschen
            </button>

          </div>

        )}

      </div>

    </article>

  );
}


/* =========================================
   ADMIN DASHBOARD
========================================= */

function AdminDashboard({
  posts,
  pending,
  onNewPost,
  onEditPost,
  onDeletePost,
  onChangeStatus
}) {

  const [tab, setTab] = useState('content');


  return (

    <section className="adminDashboard">

      <div className="dashboardHeader">

        <div>

          <p className="eyebrow dark">
            VERWALTUNG
          </p>

          <h2>
            Admin-Dashboard
          </h2>

        </div>


        <button
          className="primary"
          onClick={onNewPost}
        >
          ＋ Neuen Beitrag erstellen
        </button>

      </div>


      <div className="adminTabs">

        <button
          className={
            tab === 'content'
              ? 'active'
              : ''
          }
          onClick={() =>
            setTab('content')
          }
        >
          📰 Inhalte ({posts.length})
        </button>


        <button
          className={
            tab === 'members'
              ? 'active'
              : ''
          }
          onClick={() =>
            setTab('members')
          }
        >
          👥 Freigaben ({pending.length})
        </button>

      </div>


      {tab === 'content' && (

        <div className="adminContentList">

          {posts.map(post => (

            <div
              className="adminContentRow"
              key={post.id}
            >

              <div>

                <span className={`category ${post.category}`}>
                  {categoryLabel(post.category)}
                </span>


                <strong>
                  {post.title}
                </strong>


                <small>

                  {post.status === 'PUBLISHED'
                    ? '👁 Öffentlich'
                    : '📝 Entwurf'}

                </small>

              </div>


              <div className="rowActions">

                <button
                  onClick={() =>
                    onEditPost(post)
                  }
                >
                  ✏️
                </button>


                <button
                  className="deleteButton"
                  onClick={() =>
                    onDeletePost(post.id)
                  }
                >
                  🗑️
                </button>

              </div>

            </div>

          ))}


          {!posts.length && (
            <p>
              Noch keine Inhalte vorhanden.
            </p>
          )}

        </div>

      )}


      {tab === 'members' && (

        <div className="pendingList">

          {pending.map(member => (

            <div
              className="pending"
              key={member.id}
            >

              <div>

                <strong>
                  {member.nickname}
                </strong>


                <span>

                  {member.first_name}{' '}
                  {member.last_name}

                </span>

              </div>


              <div>

                <button
                  className="approve"
                  onClick={() =>
                    onChangeStatus(
                      member.id,
                      'APPROVED'
                    )
                  }
                >
                  Freigeben
                </button>


                <button
                  className="reject"
                  onClick={() =>
                    onChangeStatus(
                      member.id,
                      'REJECTED'
                    )
                  }
                >
                  Ablehnen
                </button>

              </div>

            </div>

          ))}


          {!pending.length && (
            <p>
              Keine offenen Registrierungen.
            </p>
          )}

        </div>

      )}

    </section>

  );
}


/* =========================================
   APP
========================================= */

function App() {

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  const [posts, setPosts] = useState([]);
  const [members, setMembers] = useState([]);
  const [pending, setPending] = useState([]);

  const [activePage, setActivePage] =
    useState('home');

  const [authOpen, setAuthOpen] =
    useState(false);

  const [authMode, setAuthMode] =
    useState('login');

  const [editorOpen, setEditorOpen] =
    useState(false);

  const [editingPost, setEditingPost] =
    useState(null);

  const [notice, setNotice] =
    useState('');


  const isAdmin =
    profile?.role === 'ADMIN' ||
    profile?.role === 'HEAD_ADMIN';


  async function loadData() {

    const {
      data: {
        user: currentUser
      }
    } = await supabase.auth.getUser();


    if (currentUser) {

      const { data: profileData } =
        await supabase
          .from('profiles')
          .select('*')
          .eq('id', currentUser.id)
          .single();


      setProfile(profileData);

    }


    let postQuery =
      supabase
        .from('posts')
        .select('*')
        .order('featured', {
          ascending: false
        })
        .order('created_at', {
          ascending: false
        });


    if (!currentUser ||
        !['ADMIN', 'HEAD_ADMIN'].includes(
          profile?.role
        )) {

      postQuery =
        postQuery.eq(
          'status',
          'PUBLISHED'
        );

    }


    const { data: postData } =
      await postQuery;


    setPosts(postData || []);


    const { data: memberData } =
      await supabase
        .from('profiles')
        .select('*')
        .eq(
          'status',
          'APPROVED'
        )
        .order('nickname');


    setMembers(memberData || []);

  }


  useEffect(() => {

    supabase.auth
      .getUser()
      .then(({ data }) => {
        setUser(data.user || null);
      });


    const {
      data: { subscription }
    } =
      supabase.auth.onAuthStateChange(
        (_event, session) => {

          setUser(
            session?.user || null
          );

        }
      );


    return () =>
      subscription.unsubscribe();

  }, []);


  useEffect(() => {

    if (!user) {

      setProfile(null);
      return;

    }


    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {

        setProfile(data || null);

      });

  }, [user]);


  useEffect(() => {

    loadData();

  }, [user, profile?.role]);


  useEffect(() => {

    if (!isAdmin) {

      setPending([]);
      return;

    }


    supabase
      .from('profiles')
      .select('*')
      .eq(
        'status',
        'PENDING_ADMIN'
      )
      .order(
        'created_at',
        {
          ascending: false
        }
      )
      .then(({ data }) => {

        setPending(data || []);

      });

  }, [isAdmin]);


  function openAuth(mode) {

    setAuthMode(mode);
    setAuthOpen(true);

  }


  function openNewPost() {

    setEditingPost(null);
    setEditorOpen(true);

  }


  function openEditPost(post) {

    setEditingPost(post);
    setEditorOpen(true);

  }


  async function deletePost(id) {

    const confirmed =
      window.confirm(
        'Diesen Beitrag wirklich löschen?'
      );


    if (!confirmed) return;


    const { error } =
      await supabase
        .from('posts')
        .delete()
        .eq('id', id);


    setNotice(
      error
        ? error.message
        : 'Beitrag wurde gelöscht.'
    );


    loadData();

  }


  async function changeStatus(
    id,
    newStatus
  ) {

    const { error } =
      await supabase.rpc(
        'set_account_status',
        {
          target_user: id,
          new_status: newStatus,
          note: ''
        }
      );


    setNotice(
      error
        ? error.message
        : 'Mitglied aktualisiert.'
    );


    if (!error) {

      setPending(
        pending.filter(
          member =>
            member.id !== id
        )
      );

    }

  }


  const announcements =
    posts.filter(
      post =>
        post.category === 'ANNOUNCEMENT'
    );


  const news =
    posts.filter(
      post =>
        post.category === 'NEWS'
    );


  const events =
    posts.filter(
      post =>
        post.category === 'EVENT'
    );


  const community =
    posts.filter(
      post =>
        post.category === 'COMMUNITY'
    );


  function renderHome() {

    return (

      <>

        <section className="homeHero">

          <div className="homeHeroOverlay" />

          <div className="homeHeroContent">

            <p className="eyebrow">
              WILLKOMMEN IM ENNSTAL
            </p>


            <h1>
              Was ist los
              <br />
              im Ennstal?
            </h1>


            <p>
              News, Menschen, Veranstaltungen
              und Geschichten aus deiner Region.
            </p>


            <div className="heroButtons">

              <button
                className="primary big"
                onClick={() =>
                  setActivePage('community')
                }
              >
                Community entdecken
              </button>


              <button
                className="heroSecondary"
                onClick={() =>
                  setActivePage('events')
                }
              >
                Events entdecken
              </button>

            </div>

          </div>

        </section>


        {announcements.length > 0 && (

          <section className="announcementSection">

            <div className="sectionWrap">

              <div className="sectionTitle">

                <span>
                  📌
                </span>

                <div>

                  <p className="eyebrow dark">
                    WICHTIG
                  </p>

                  <h2>
                    Ankündigungen
                  </h2>

                </div>

              </div>


              <div className="announcementGrid">

                {announcements
                  .slice(0, 3)
                  .map(post => (

                    <PostCard
                      key={post.id}
                      post={post}
                      admin={isAdmin}
                      onEdit={openEditPost}
                      onDelete={deletePost}
                    />

                  ))}

              </div>

            </div>

          </section>

        )}


        <section className="sectionWrap contentSection">

          <div className="sectionHeader">

            <div>

              <p className="eyebrow dark">
                AKTUELL
              </p>

              <h2>
                Neuigkeiten aus der Region
              </h2>

            </div>


            <button
              className="textButton"
              onClick={() =>
                setActivePage('news')
              }
            >
              Alle News →
            </button>

          </div>


          <div className="postGrid">

            {news
              .slice(0, 3)
              .map(post => (

                <PostCard
                  key={post.id}
                  post={post}
                  admin={isAdmin}
                  onEdit={openEditPost}
                  onDelete={deletePost}
                />

              ))}


            {!news.length && (

              <div className="emptyState">

                <h3>
                  Noch keine News
                </h3>

                <p>
                  Hier erscheinen bald aktuelle
                  Neuigkeiten aus der Region.
                </p>

              </div>

            )}

          </div>

        </section>


        <section className="eventSection">

          <div className="sectionWrap">

            <div className="sectionHeader">

              <div>

                <p className="eyebrow">
                  GEMEINSAM ERLEBEN
                </p>

                <h2>
                  Kommende Events
                </h2>

              </div>


              <button
                className="textButton light"
                onClick={() =>
                  setActivePage('events')
                }
              >
                Alle Events →
              </button>

            </div>


            <div className="postGrid">

              {events
                .slice(0, 3)
                .map(post => (

                  <PostCard
                    key={post.id}
                    post={post}
                    admin={isAdmin}
                    onEdit={openEditPost}
                    onDelete={deletePost}
                  />

                ))}


              {!events.length && (

                <div className="emptyState darkEmpty">

                  <h3>
                    Noch keine Events
                  </h3>

                  <p>
                    Neue Veranstaltungen erscheinen
                    bald hier.
                  </p>

                </div>

              )}

            </div>

          </div>

        </section>


        <section className="sectionWrap contentSection">

          <div className="sectionHeader">

            <div>

              <p className="eyebrow dark">
                MENSCHEN & GESCHICHTEN
              </p>

              <h2>
                Aus der Community
              </h2>

            </div>


            <button
              className="textButton"
              onClick={() =>
                setActivePage('community')
              }
            >
              Mehr entdecken →
            </button>

          </div>


          <div className="postGrid">

            {community
              .slice(0, 3)
              .map(post => (

                <PostCard
                  key={post.id}
                  post={post}
                  admin={isAdmin}
                  onEdit={openEditPost}
                  onDelete={deletePost}
                />

              ))}

          </div>

        </section>

      </>

    );

  }


  function renderPostsPage(
    title,
    subtitle,
    data
  ) {

    return (

      <section className="pageSection">

        <div className="sectionWrap">

          <div className="pageHeading">

            <p className="eyebrow dark">
              ENNSTAL CONNECT
            </p>

            <h1>
              {title}
            </h1>

            <p>
              {subtitle}
            </p>

          </div>


          <div className="postGrid largeGrid">

            {data.map(post => (

              <PostCard
                key={post.id}
                post={post}
                admin={isAdmin}
                onEdit={openEditPost}
                onDelete={deletePost}
              />

            ))}


            {!data.length && (

              <div className="emptyState">

                <h3>
                  Noch nichts vorhanden
                </h3>

                <p>
                  Neue Inhalte erscheinen bald hier.
                </p>

              </div>

            )}

          </div>

        </div>

      </section>

    );

  }


  function renderMembers() {

    return (

      <section className="pageSection">

        <div className="sectionWrap">

          <div className="pageHeading">

            <p className="eyebrow dark">
              COMMUNITY
            </p>

            <h1>
              Mitglieder
            </h1>

            <p>
              Entdecke Menschen aus deiner Region.
            </p>

          </div>


          <div className="memberGrid">

            {members.map(member => {

              const adminMember =
                member.role === 'ADMIN' ||
                member.role === 'HEAD_ADMIN';

              const supporter =
                member.role === 'SUPPORTER';


              return (

                <article
                  key={member.id}
                  className={
                    `memberCard ${
                      adminMember
                        ? 'admin'
                        : supporter
                        ? 'supporter'
                        : ''
                    }`
                  }
                >

                  <div className="avatar">

                    {member.avatar_url ? (

                      <img
                        src={member.avatar_url}
                        alt=""
                      />

                    ) : (

                      member.nickname
                        ?.charAt(0)
                        ?.toUpperCase()

                    )}

                  </div>


                  <h3>

                    {member.nickname}


                    {adminMember &&
                      member.is_online && (

                      <img
                        src="/admin-star.png"
                        className="nicknameStar"
                        alt="Admin"
                      />

                    )}


                    {supporter &&
                      member.is_online && (

                      <img
                        src="/supporter-star.png"
                        className="nicknameStar"
                        alt="Unterstützer"
                      />

                    )}

                  </h3>


                  <p>

                    {member.first_name}{' '}
                    {member.last_name}

                  </p>


                  <small
                    className={
                      member.is_online
                        ? 'online'
                        : 'offline'
                    }
                  >

                    ● {member.is_online
                      ? 'Online'
                      : 'Offline'}

                  </small>

                </article>

              );

            })}

          </div>

        </div>

      </section>

    );

  }


  return (

    <div className="app">


      {authOpen && (

        <Auth
          initialMode={authMode}
          onClose={() =>
            setAuthOpen(false)
          }
        />

      )}


      {editorOpen && (

        <PostEditor
          post={editingPost}
          user={user}
          onClose={() =>
            setEditorOpen(false)
          }
          onSaved={() => {

            setNotice(
              'Beitrag erfolgreich gespeichert.'
            );

            loadData();

          }}
        />

      )}


      <header className="mainHeader">

        <button
          className="brandButton"
          onClick={() =>
            setActivePage('home')
          }
        >

          <span className="brandIcon">
            🏔️
          </span>

          <span>
            ennstal connect
          </span>

        </button>


        <nav className="mainNav">

          <button
            onClick={() =>
              setActivePage('home')
            }
            className={
              activePage === 'home'
                ? 'active'
                : ''
            }
          >
            Start
          </button>


          <button
            onClick={() =>
              setActivePage('news')
            }
            className={
              activePage === 'news'
                ? 'active'
                : ''
            }
          >
            News
          </button>


          <button
            onClick={() =>
              setActivePage('events')
            }
            className={
              activePage === 'events'
                ? 'active'
                : ''
            }
          >
            Events
          </button>


          <button
            onClick={() =>
              setActivePage('community')
            }
            className={
              activePage === 'community'
                ? 'active'
                : ''
            }
          >
            Community
          </button>


          <button
            onClick={() =>
              setActivePage('members')
            }
            className={
              activePage === 'members'
                ? 'active'
                : ''
            }
          >
            Mitglieder
          </button>


          {isAdmin && (

            <button
              className={
                activePage === 'admin'
                  ? 'active adminNav'
                  : 'adminNav'
              }
              onClick={() =>
                setActivePage('admin')
              }
            >
              🔒 Admin
            </button>

          )}

        </nav>


        <div className="headerActions">

          {user ? (

            <>

              <div className="userHeader">

                <span>

                  {profile?.nickname ||
                    user.email}

                </span>


                {(profile?.role === 'ADMIN' ||
                  profile?.role === 'HEAD_ADMIN') && (

                  <img
                    src="/admin-star.png"
                    className="headerRoleStar"
                    alt="Admin"
                  />

                )}


                {profile?.role === 'SUPPORTER' && (

                  <img
                    src="/supporter-star.png"
                    className="headerRoleStar"
                    alt="Unterstützer"
                  />

                )}

              </div>


              <button
                className="ghost"
                onClick={() =>
                  supabase.auth.signOut()
                }
              >
                Abmelden
              </button>

            </>

          ) : (

            <>

              <button
                className="ghost"
                onClick={() =>
                  openAuth('login')
                }
              >
                Anmelden
              </button>


              <button
                className="primary"
                onClick={() =>
                  openAuth('register')
                }
              >
                Mitmachen
              </button>

            </>

          )}

        </div>

      </header>


      {notice && (

        <div className="globalNotice">

          {notice}

          <button
            onClick={() =>
              setNotice('')
            }
          >
            ×
          </button>

        </div>

      )}


      <main>

        {activePage === 'home' &&
          renderHome()}

        {activePage === 'news' &&
          renderPostsPage(
            'Aktuelle News',
            'Neuigkeiten und Geschichten aus dem Ennstal.',
            news
          )}

        {activePage === 'events' &&
          renderPostsPage(
            'Events',
            'Entdecke Veranstaltungen und gemeinsame Erlebnisse.',
            events
          )}

        {activePage === 'community' &&
          renderPostsPage(
            'Community',
            'Menschen, Geschichten und Beiträge aus der Region.',
            community
          )}

        {activePage === 'members' &&
          renderMembers()}

        {activePage === 'admin' &&
          isAdmin && (

            <AdminDashboard
              posts={posts}
              pending={pending}
              onNewPost={openNewPost}
              onEditPost={openEditPost}
              onDeletePost={deletePost}
              onChangeStatus={changeStatus}
            />

          )}

      </main>


      <footer className="siteFooter">

        <div>

          © 2026 ennstal connect

          <span>
            · Regional. Verbunden. Gemeinsam.
          </span>

        </div>


        <div className="footerLinks">

          <button>
            Impressum
          </button>

          <button>
            Datenschutz
          </button>

          <button>
            Community-Regeln
          </button>

        </div>

      </footer>

    </div>

  );

}


createRoot(
  document.getElementById('root')
).render(<App />);
