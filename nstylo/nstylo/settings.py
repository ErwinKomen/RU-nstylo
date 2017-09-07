"""
Django settings for nstylo project.

Generated by 'django-admin startproject' using Django 1.9.1.

For more information on this file, see
https://docs.djangoproject.com/en/1.9/topics/settings/

For the full list of settings and their values, see
https://docs.djangoproject.com/en/1.9/ref/settings/
"""

import os
import posixpath
from django.contrib import admin

# Build paths inside the project like this: os.path.join(BASE_DIR, ...)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WRITABLE_DIR = os.path.abspath(os.path.join(BASE_DIR, "../../writable/database/"))
RESULTS_DIR = os.path.abspath(os.path.join(BASE_DIR, "../../writable/results/"))
if "RU-nstylo\\writable" in WRITABLE_DIR:
    # Need another string
    WRITABLE_DIR = os.path.abspath(os.path.join(BASE_DIR, "../../../writable/database/"))
    RESULTS_DIR = os.path.abspath(os.path.join(BASE_DIR, "../../../writable/results/"))

APP_PREFIX = "/"
STATICDIR = "/"
if "d:" in WRITABLE_DIR or "D:" in WRITABLE_DIR:
    APP_PREFIX =  "nlab/"           # WAS:    ""
    admin.site.site_url = '/nlab'   # WAS:    '/'
    STATICDIR = "/Data Files/vs2010/projects/RU-nstylo/nstylo/nstylo/static"
elif "/var/www" in WRITABLE_DIR:
    # New configuration of http://corpus-studio-web.cttnww-meertens.surf-hosted.nl/nlab
    APP_PREFIX = "nlab/"
    admin.site.site_url = '/nlab'
else:
    admin.site.site_url = '/'

FORCE_SCRIPT_NAME = admin.site.site_url



# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/1.9/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = 'c7fe524b-c30b-4217-8b69-9daba49801b4'

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = True

ALLOWED_HOSTS = ['localhost', 'corpus-studio-web.cttnww-meertens.surf-hosted.nl']


# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.admindocs',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Add your apps here to enable them
    'nstylo.stylometry',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.auth.middleware.SessionAuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'nstylo.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [os.path.join(BASE_DIR, 'nstylo/templates')],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'nstylo.wsgi.application'


# Database
# https://docs.djangoproject.com/en/1.9/ref/settings/#databases

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': os.path.join(WRITABLE_DIR, 'nstylo.db'),
    }
}


# Password validation
# https://docs.djangoproject.com/en/1.9/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/1.9/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_L10N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/1.9/howto/static-files/

STATIC_URL = '/static/'
MEDIA_URL = '/media/'
if ("/var/www" in WRITABLE_DIR):
    STATIC_URL = "/" + APP_PREFIX + "static/"
    MEDIA_URL = "/" + APP_PREFIX + "media/"

STATIC_ROOT = os.path.abspath(os.path.join("/", posixpath.join(*(BASE_DIR.split(os.path.sep) + ['static']))))
MEDIA_ROOT = os.path.abspath(os.path.join("/", posixpath.join(*(BASE_DIR.split(os.path.sep) + ['media']))))


        
STATICFILES_DIRS = [
    STATICDIR
]

STATICFILES_FINDERS = [
    'django.contrib.staticfiles.finders.FileSystemFinder',
    'django.contrib.staticfiles.finders.AppDirectoriesFinder',
]