import Config from './config.js'
import KeyWatcher from './key-watcher.js'
import Logger from './logger.js'
import Viewer from './viewer.js'

class PhotoSlideshow {
  constructor(window, element) {
    this.window = window
    this.element = element
    this._config = null
    this._errors = null
    this.help = null
    this.images = null
    this.keyWatcher = null
    this.logger = null
    this.notes = []
    this.showNextTimeout = null
    this.paused = false
    this.previousShow = null
    this.status = null
    this.timeout = null
  }

  get config() {
    if (this._config) {
      return this._config
    }

    this._config = new Config(this.window)
    return this._config
  }

  get currentImage() {
    const index = this.viewer.showIndex
    if (index === null) {
      return null
    }
    return this.images[index]
  }

  get errors() {
    if (this._errors) {
      return this._errors
    }
    this._errors = []
    if (!this.window) {
      this._errors.push('window is null')
    }
    if (!this.element) {
      this._errors.push('element is null')
    }
    if (!this.config.url) {
      this._errors.push('supply a config=URL query parameter')
    }
    return this._errors
  }

  get error() {
    return this.errors.join("\n")
  }

  get inFocusMode() {
    return this.images !== this.config.images
  }

  get ok() {
    return this.errors.length === 0
  }

  run() {
    this.logger = new Logger()
    if (!this.ok) {
      const error = this.error
      console.error(error)
      if (this.element) {
        this.element.innerHTML = error
      }
      return
    }
    this.viewer = new Viewer(this.element, this.logger)
    this.viewer.addEventListener('imageLoaded', this.imageLoaded.bind(this))
    this.viewer.addEventListener('imageFailed', this.imageFailed.bind(this))
    this.viewer.start()
    this.setupKeyWatcher()
    this.trackWindowResizing()
    this.config.addEventListener('loaded', this.configLoaded.bind(this))
    this.config.addEventListener('failed', this.configFailed.bind(this))
    this.config.load()
  }

  configLoaded() {
    this.images = this.config.images
    this.timeout = this.config.timeout
    this.logger.debug('Starting slideshow')
    this.preload(0)
  }

  configFailed(error) {
    this.logger.debug('Failed to load config: ', error)
    this.element.innerHTML = error
  }

  setupKeyWatcher() {
    this.keyWatcher = new KeyWatcher(this.window.document, this.logger)
    this.keyWatcher.addEventListener('c', this.toggleCaptions.bind(this))
    this.keyWatcher.addEventListener('f', this.toggleFocusMode.bind(this))
    this.keyWatcher.addEventListener('del', this.removeCurrent.bind(this))
    this.keyWatcher.addEventListener('h', this.toggleHelp.bind(this))
    this.keyWatcher.addEventListener('l', this.listNotes.bind(this))
    this.keyWatcher.addEventListener('left', this.goToPrevious.bind(this))
    this.keyWatcher.addEventListener('minus', this.slowDown.bind(this))
    this.keyWatcher.addEventListener('n', this.addNote.bind(this))
    this.keyWatcher.addEventListener('plus', this.speedUp.bind(this))
    this.keyWatcher.addEventListener('q', this.lessVerbose.bind(this))
    this.keyWatcher.addEventListener('r', this.resetNotes.bind(this))
    this.keyWatcher.addEventListener('right', this.goToNext.bind(this))
    this.keyWatcher.addEventListener('space', this.togglePause.bind(this))
    this.keyWatcher.addEventListener('v', this.moreVerbose.bind(this))
    this.keyWatcher.run()
  }

  addNote() {
    const index = this.viewer.showIndex
    if (index === null) {
      return
    }
    const image = this.images[index]
    const exists = this.notes.findIndex(url => url === image.url)
    if (exists !== -1) {
      return
    }
    this.logger.debug(`Adding note for '${image.url}'`)
    this.notes.push(image.url)
  }

  goToNext() {
    this.logger.debug('Skipping forwards')
    this.stopTimeout()
    this.showPreloadingImageImmediatly()
    this.next()
  }

  goToPrevious() {
    this.logger.debug('Skipping backwards')
    this.showPreloadingImageImmediatly()
    this.previous()
  }

  lessVerbose() {
    const changed = this.logger.lessVerbose()
    if (changed) {
      this.logger.debug(`Logger level reduced to ${this.logger.level}`)
    } else {
      this.logger.debug(`Logger level unchanged: ${this.logger.level}`)
    }
    this.updateStatus()
  }

  listNotes() {
    alert(this.notes.join("\n"))
  }

  moreVerbose() {
    const changed = this.logger.moreVerbose()
    if (changed) {
      this.logger.debug(`Logger level increased to ${this.logger.level}`)
    } else {
      this.logger.debug(`Logger level unchanged: ${this.logger.level}`)
    }
    this.updateStatus()
  }

  removeCurrent() {
    this.logger.debug('Deleting current image')
    this.stopTimeout()
    const index = this.viewer.showIndex
    this.removeImage(index)
    let nextIndex
    if (index === this.images.length) {
      nextIndex = 0
    } else {
      nextIndex = index
    }
    this.showPreloadingImageImmediatly()
    this.preload(index)
  }

  resetNotes() {
    this.notes = []
  }

  slowDown() {
    this.timeout = this.timeout + 500
    this.logger.debug(`Slide change timeout increased to ${this.timeout}ms`)
  }

  speedUp() {
    if (this.timeout <= PhotoSlideshow.MINIMUM_TIMEOUT) {
      this.logger.debug(`Can't change slide change timeout as it is already at the quickest (${PhotoSlideshow.MINIMUM_TIMEOUT}ms)`)
      return
    }
    this.timeout = this.timeout - 500
    this.logger.debug(`Slide change timeout reduced to ${this.timeout}ms`)
  }

  toggleCaptions() {
    if (this.viewer.showCaption) {
      this.viewer.showCaption = false
      this.viewer.resize()
      this.logger.debug('Hide caption')
    } else {
      this.viewer.showCaption = true
      this.viewer.resize()
      this.logger.debug('Show caption')
    }
    this.updateStatus()
  }

  toggleFocusMode() {
    const current = this.currentImage
    if (!current) {
      this.logger.debug("Can't toggle focus mode as there's no current image")
      return
    }
    this.stopTimeout()
    this.viewer.cancelPreload()
    if (this.inFocusMode) {
      this.logger.debug('Leaving focus mode')
      this.images = this.config.images
    } else {
      const path = current.url.replace(/\/[^/]*$/, '')
      const images = this.config.images.filter(i => i.url.startsWith(path))
      this.logger.debug(`Starting focus mode, ${images.length} images starting with '${path}'`)
      this.images = images
    }
    const currentIndex = this.images.findIndex(i => i.url === current.url)
    let nextIndex
    if (currentIndex === this.images.length - 1) {
      nextIndex = 0
    } else {
      nextIndex = currentIndex + 1
    }
    this.updateStatus()
    this.preload(nextIndex)
  }

  toggleHelp() {
    if (this.help) {
      this.help.remove()
      this.help = null
    } else {
      this.help = this.window.document.createElement('p')
      this.help.classList.add('help')
      this.help.innerHTML = `
      c - show/hide captions,<br>
      f - enter/leave 'focus' mode<br>
      h - show/hide this help,<br>
      l - list notes,<br>
      n - add current image to list of notes,<br>
      q - show less logging messages,<br>
      r - reset (clear) the list of notes,<br>
      v - show more logging messages,<br>
      ← - go to previous image,<br>
      → - go to next image,<br>
      + - change slides more frequently,<br>
      - - change slides less frequently,<br>
      &lt;space> - pause/restart slideshow,<br>
      &lt;del> - remove current image
      `
      this.element.append(this.help)
    }
  }

  togglePause() {
    if (this.paused) {
      this.logger.debug('Resuming slideshow')
      this.next()
      this.paused = false
    } else {
      this.logger.debug('Pausing slideshow')
      this.stopTimeout()
      this.viewer.cancelPreload()
      this.paused = true
    }
    this.updateStatus()
  }

  trackWindowResizing() {
    this.window.addEventListener('resize', this.resize.bind(this))
  }

  resize() {
    this.viewer.resize()
  }

  removeImage(index) {
    if (!index) {
      return
    }
    if (index > this.images.length - 1) {
      this.logger.error(`Can't remove image ${index}, max index is ${this.images.length}`)
      return
    }
    if (this.images.length === 1) {
      this.logger.error("Can't remove last image")
      return
    }
    const image = this.images[index]
    this.logger.debug(`Removing image ${index}/${this.images.length} '${image.url}'`)
    this.images.splice(index, 1)
  }

  previous() {
    let previousIndex = this.viewer.previousIndex
    if (previousIndex < 0) {
      previousIndex = this.images.length - 1
    }
    this.logger.debug(`Preloading previous image, current ${this.viewer.showIndex}, next ${previousIndex}`)
    this.preload(previousIndex)
  }

  next() {
    let nextIndex = this.viewer.nextIndex
    if (nextIndex >= this.images.length) {
      nextIndex = 0
      this.logger.debug('Reached last image, looping back to first')
    }
    this.logger.debug(`Preloading image ${nextIndex}`)
    this.preload(nextIndex)
  }

  stopTimeout() {
    if (this.showNextTimeout) {
      clearTimeout(this.showNextTimeout)
      this.showNextTimeout = null
    }
  }

  preload(index) {
    this.stopTimeout()
    const next = this.images[index]
    this.logger.debug(`Preloading image ${index}/${this.images.length}, '${next.url}'`)
    this.viewer.preload(next, index)
  }

  showPreloadingImageImmediatly() {
    this.previousShow = null
  }

  imageLoaded(image, index) {
    this.stopTimeout()
    this.logger.debug(`Loading complete for image ${index} '${image.url}'`)
    if (!this.previousShow) {
      this.showPreloaded()
      return
    }
    // We've waited for the image to download
    const now = new Date()
    const elapsed = now - this.previousShow
    // Have we waited more than the usual wait time between images?
    const remainder = this.timeout - elapsed
    if (remainder < 0) {
      this.showPreloaded()
      return
    }
    // Wait the remainder of the time
    this.showNextTimeout = setTimeout(this.showPreloaded.bind(this), remainder)
  }

  showPreloaded() {
    this.showNextTimeout = null
    this.viewer.showPreloaded()
    this.previousShow = new Date
    this.next()
  }

  imageFailed(image, index) {
    this.logger.warn(`Failed to download image '${image.url}'`)
    this.notes.push(`Missing ${image.url}`)
    this.removeImage(index)
    let nextIndex
    if (index === this.images.length) {
      nextIndex = 0
    } else {
      nextIndex = index
    }
    this.showPreloadingImageImmediatly()
    this.preload(nextIndex)
  }

  updateStatus() {
    if (this.status) {
      this.status.remove()
      this.status = null
    }
    let html = ''
    if (this.viewer.showCaption) {
      html += '<h1>C</h1>'
    }
    if (this.inFocusMode) {
      html += '<h1>F</h1>'
    }
    if (this.paused) {
      html += '<h1>P</h1>'
    }
    if (this.logger.level === Logger.DEBUG) {
      html += '<h1>V</h1>'
    }
    this.status = this.window.document.createElement('p')
    this.status.classList.add('status')
    this.status.innerHTML = html
    this.element.append(this.status)
  }
}

PhotoSlideshow.MINIMUM_TIMEOUT = 500

export default PhotoSlideshow
