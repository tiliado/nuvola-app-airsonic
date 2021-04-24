/*
 * Copyright 2021 Jiří Janoušek <janousek.jiri@gmail.com>
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

'use strict';

(function (Nuvola) {
  const DEFAULT_ADDRESS = 'http://localhost:4040/index'
  const ADDRESS = 'app.address'
  const ADDRESS_TYPE = 'app.address_type'
  const ADDRESS_DEFAULT = 'default'
  const ADDRESS_CUSTOM = 'custom'

  // Translations
  const _ = Nuvola.Translate.gettext
  // Create media player component
  const player = Nuvola.$object(Nuvola.MediaPlayer)

  // Handy aliases
  const PlaybackState = Nuvola.PlaybackState
  const PlayerAction = Nuvola.PlayerAction

  // Create new WebApp prototype
  const WebApp = Nuvola.$WebApp()

  WebApp._onInitAppRunner = function (emitter) {
    Nuvola.WebApp._onInitAppRunner.call(this, emitter)
    Nuvola.config.setDefault(ADDRESS_TYPE, ADDRESS_DEFAULT)
    Nuvola.config.setDefault(ADDRESS, DEFAULT_ADDRESS)
    Nuvola.core.connect('InitializationForm', this)
    Nuvola.core.connect('PreferencesForm', this)
  }

  WebApp._onInitializationForm = function (emitter, values, entries) {
    if (!Nuvola.config.hasKey(ADDRESS_TYPE)) {
      this.appendPreferences(values, entries)
    }
  }

  WebApp._onPreferencesForm = function (emitter, values, entries) {
    this.appendPreferences(values, entries)
  }

  WebApp.appendPreferences = function (values, entries) {
    values[ADDRESS_TYPE] = Nuvola.config.get(ADDRESS_TYPE)
    values[ADDRESS] = Nuvola.config.get(ADDRESS)
    entries.push(['header', _('Airsonic')])
    entries.push(['label', _('Specify the address of your Airsonic server')])
    entries.push(['option', ADDRESS_TYPE, ADDRESS_DEFAULT,
      _('Default adress:') + ' ' + DEFAULT_ADDRESS, null, [ADDRESS]])
    entries.push(['option', ADDRESS_TYPE, ADDRESS_CUSTOM,
      _('Custom address:'), [ADDRESS], null])
    entries.push(['string', ADDRESS])
  }

  WebApp._onHomePageRequest = function (emitter, result) {
    result.url = (Nuvola.config.get(ADDRESS_TYPE) === ADDRESS_CUSTOM)
      ? Nuvola.config.get(ADDRESS)
      : DEFAULT_ADDRESS
  }

  // Initialization routines
  WebApp._onInitWebWorker = function (emitter) {
    Nuvola.WebApp._onInitWebWorker.call(this, emitter)

    const state = document.readyState
    if (state === 'interactive' || state === 'complete') {
      this._onPageReady()
    } else {
      document.addEventListener('DOMContentLoaded', this._onPageReady.bind(this))
    }
  }

  // Page is ready for magic
  WebApp._onPageReady = function () {
    // Connect handler for signal ActionActivated
    Nuvola.actions.connect('ActionActivated', this)
    this.frame = window.frames.playQueue
    this.duration = null

    // Start update routine
    if (this.frame) {
      this.update()
    }
  }

  // Extract data from the web page
  WebApp.update = function () {
    const elms = this._getElements()

    let song = null
    let track

    if (this.frame.songs && this.frame.getCurrentSongIndex) {
      song = this.frame.songs[this.frame.getCurrentSongIndex()]
    }

    if (song) {
      track = {
        title: song.title,
        artist: song.artist,
        album: song.album,
        artLocation: song.coverArtUrl,
        rating: null,
        length: song.duration * 1000000
      }
    } else {
      track = {
        title: null,
        artist: null,
        album: null,
        artLocation: null,
        rating: null,
        length: null
      }
    }

    this.duration = track.length

    let state
    if (elms.pause) {
      state = PlaybackState.PLAYING
    } else if (elms.play) {
      state = PlaybackState.PAUSED
    } else {
      state = PlaybackState.UNKNOWN
    }
    player.setPlaybackState(state)
    player.setTrack(track)

    player.setCanGoPrev(!!elms.prev)
    player.setCanGoNext(!!elms.next)
    player.setCanPlay(!!elms.play)
    player.setCanPause(!!elms.pause)

    player.setTrackPosition(Nuvola.queryText([this.frame.document, '.mejs__currenttime']))
    player.setCanSeek(state !== PlaybackState.UNKNOWN && elms.progressbar)

    player.setCanChangeVolume(!!elms.volumebar)
    player.updateVolume(Nuvola.queryAttribute(
      [this.frame.document, '.mejs__horizontal-volume-slider'],
      'aria-valuenow',
      (volume) => volume / 100
    ))

    const repeat = this._getRepeat()
    player.setCanRepeat(repeat !== null)
    player.setRepeatState(repeat)

    // Schedule the next update
    setTimeout(this.update.bind(this), 500)
  }

  // Handler of playback actions
  WebApp._onActionActivated = function (emitter, name, param) {
    const elms = this._getElements()
    switch (name) {
      case PlayerAction.TOGGLE_PLAY:
        if (elms.play) {
          Nuvola.clickOnElement(elms.play)
        } else {
          Nuvola.clickOnElement(elms.pause)
        }
        break
      case PlayerAction.PLAY:
        Nuvola.clickOnElement(elms.play)
        break
      case PlayerAction.PAUSE:
      case PlayerAction.STOP:
        Nuvola.clickOnElement(elms.pause)
        break
      case PlayerAction.PREV_SONG:
        this.frame.onPrevious()
        break
      case PlayerAction.NEXT_SONG:
        this.frame.onNext(false)
        break
      case PlayerAction.SEEK:
        if (this.duration && param > 0 && param <= this.duration) {
          Nuvola.clickOnElement(elms.progressbar, param / this.duration, 0.5)
        }
        break
      case PlayerAction.CHANGE_VOLUME:
        Nuvola.clickOnElement(elms.volumebar, param, 0.5)
        break
      case PlayerAction.REPEAT:
        this._setRepeat(param)
        break
    }
  }

  WebApp._getElements = function () {
  // Interesting elements
    const elms = {
      play: this.frame.document.querySelector('#player .mejs__play button'),
      pause: this.frame.document.querySelector('#player .mejs__pause button'),
      next: this.frame.document.querySelector('.header > img[src$="back.svg"]'),
      prev: this.frame.document.querySelector('.header > img[src$="forward.svg"]'),
      repeat: this.frame.document.getElementById('toggleRepeat'),
      progressbar: this.frame.document.querySelector('.mejs__time-slider'),
      volumebar: this.frame.document.querySelector('.mejs__horizontal-volume-slider')
    }

    // Ignore disabled buttons
    for (const key in elms) {
      if (elms[key] && elms[key].disabled) {
        elms[key] = null
      }
    }

    return elms
  }

  WebApp._getRepeat = function () {
    if (this.frame.repeatEnabled === true) {
      return Nuvola.PlayerRepeat.PLAYLIST
    }

    if (this.frame.repeatEnabled === false) {
      return Nuvola.PlayerRepeat.NONE
    }

    return null
  }

  WebApp._setRepeat = function (repeat) {
    if (repeat !== Nuvola.PlayerRepeat.TRACK && this._getRepeat() !== repeat) {
      this.frame.onToggleRepeat()
    }
  }

  WebApp.start()
})(this) // function(Nuvola)
