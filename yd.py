#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
YouTube Video Info & Download Tool
Windows와 macOS에서 모두 동작하는 YouTube 비디오 정보 확인, 썸네일 및 비디오 다운로더
"""

import sys
import os
import re
import requests
from urllib.parse import urlparse, parse_qs
from pathlib import Path
import platform
import qrcode
from io import BytesIO

from PyQt5.QtWidgets import (QApplication, QMainWindow, QVBoxLayout, QHBoxLayout, 
                            QWidget, QLabel, QLineEdit, QPushButton, QTextEdit, 
                            QFileDialog, QMessageBox, QProgressBar, QComboBox,
                            QGroupBox, QGridLayout, QScrollArea, QTabWidget)
from PyQt5.QtCore import QThread, pyqtSignal, Qt
from PyQt5.QtGui import QPixmap, QFont, QIcon
from PIL import Image
import yt_dlp


class VideoInfoExtractor(QThread):
    """비디오 정보 추출을 위한 워커 스레드"""
    progress = pyqtSignal(str)
    finished = pyqtSignal(bool, dict)
    
    def __init__(self, url):
        super().__init__()
        self.url = url
    
    def run(self):
        try:
            self.progress.emit("YouTube 비디오 정보를 가져오는 중...")
            
            # yt-dlp를 사용하여 비디오 정보 가져오기
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'extract_flat': False,
                'writecomments': True,
                'getcomments': True,
            }
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(self.url, download=False)
                
                # 필요한 정보 추출
                video_data = {
                    'title': info.get('title', 'Unknown'),
                    'view_count': info.get('view_count', 0),
                    'like_count': info.get('like_count', 0),
                    'duration': info.get('duration', 0),
                    'upload_date': info.get('upload_date', 'Unknown'),
                    'uploader': info.get('uploader', 'Unknown'),
                    'description': info.get('description', ''),
                    'thumbnails': info.get('thumbnails', []),
                    'comments': info.get('comments', []),
                    'url': self.url
                }
                
                self.progress.emit("비디오 정보 추출 완료!")
                self.finished.emit(True, video_data)
                
        except Exception as e:
            self.finished.emit(False, {'error': str(e)})


class ThumbnailDownloader(QThread):
    """썸네일 다운로드를 위한 워커 스레드"""
    progress = pyqtSignal(str)
    finished = pyqtSignal(bool, str)
    
    def __init__(self, url, save_path, quality):
        super().__init__()
        self.url = url
        self.save_path = save_path
        self.quality = quality
    
    def run(self):
        try:
            self.progress.emit("YouTube URL 정보를 가져오는 중...")
            
            # yt-dlp를 사용하여 비디오 정보 가져오기
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
            }
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(self.url, download=False)
                
                video_title = info.get('title', 'Unknown')
                # 파일명에 사용할 수 없는 문자 제거
                safe_title = re.sub(r'[<>:"/\\|?*]', '_', video_title)
                
                # 썸네일 URL 찾기
                thumbnails = info.get('thumbnails', [])
                if not thumbnails:
                    self.finished.emit(False, "썸네일을 찾을 수 없습니다.")
                    return
                
                # 품질에 따른 썸네일 선택
                thumbnail_url = self.select_thumbnail_by_quality(thumbnails, self.quality)
                
                if not thumbnail_url:
                    self.finished.emit(False, "선택한 품질의 썸네일을 찾을 수 없습니다.")
                    return
                
                self.progress.emit(f"썸네일 다운로드 중... ({self.quality})")
                
                # 썸네일 다운로드
                response = requests.get(thumbnail_url, stream=True)
                response.raise_for_status()
                
                # 파일 확장자 결정
                content_type = response.headers.get('content-type', '')
                if 'webp' in content_type:
                    ext = '.webp'
                elif 'png' in content_type:
                    ext = '.png'
                else:
                    ext = '.jpg'
                
                # 파일 저장
                filename = f"{safe_title}_thumbnail_{self.quality}{ext}"
                file_path = os.path.join(self.save_path, filename)
                
                with open(file_path, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)
                
                self.progress.emit("썸네일 저장 완료!")
                self.finished.emit(True, f"썸네일이 저장되었습니다:\n{file_path}")
                
        except Exception as e:
            self.finished.emit(False, f"오류 발생: {str(e)}")
    
    def select_thumbnail_by_quality(self, thumbnails, quality):
        """품질에 따른 썸네일 URL 선택"""
        # 품질별 우선순위 설정
        quality_preferences = {
            'maxres': ['maxresdefault', 'maxres'],
            'high': ['hqdefault', 'high'],
            'medium': ['mqdefault', 'medium'],
            'standard': ['sddefault', 'standard'],
            'default': ['default']
        }
        
        # 먼저 해상도 기준으로 정렬
        sorted_thumbnails = sorted(thumbnails, 
                                 key=lambda x: (x.get('width', 0), x.get('height', 0)), 
                                 reverse=True)
        
        # 품질 설정에 따른 선택
        preferences = quality_preferences.get(quality, ['maxresdefault'])
        
        # ID 기준으로 썸네일 찾기
        for pref in preferences:
            for thumb in sorted_thumbnails:
                if pref in str(thumb.get('id', '')).lower():
                    return thumb['url']
        
        # 품질별 해상도 기준으로 선택
        if quality == 'maxres':
            return sorted_thumbnails[0]['url'] if sorted_thumbnails else None
        elif quality == 'high':
            for thumb in sorted_thumbnails:
                if thumb.get('width', 0) >= 1280:
                    return thumb['url']
        elif quality == 'medium':
            for thumb in sorted_thumbnails:
                if 640 <= thumb.get('width', 0) < 1280:
                    return thumb['url']
        elif quality == 'standard':
            for thumb in sorted_thumbnails:
                if 480 <= thumb.get('width', 0) < 640:
                    return thumb['url']
        
        # 기본값으로 첫 번째 썸네일 반환
        return sorted_thumbnails[0]['url'] if sorted_thumbnails else None


class VideoDownloader(QThread):
    """비디오 다운로드를 위한 워커 스레드"""
    progress = pyqtSignal(str)
    progress_percent = pyqtSignal(int)
    finished = pyqtSignal(bool, str)
    
    def __init__(self, url, save_path, quality, format_type):
        super().__init__()
        self.url = url
        self.save_path = save_path
        self.quality = quality
        self.format_type = format_type
    
    def run(self):
        try:
            self.progress.emit("비디오 다운로드를 시작합니다...")
            
            def progress_hook(d):
                if d['status'] == 'downloading':
                    if 'total_bytes' in d and d['total_bytes']:
                        percent = int((d['downloaded_bytes'] / d['total_bytes']) * 100)
                        self.progress_percent.emit(percent)
                        self.progress.emit(f"다운로드 중... {percent}%")
                    elif '_percent_str' in d:
                        percent_str = d['_percent_str'].strip('%')
                        try:
                            percent = int(float(percent_str))
                            self.progress_percent.emit(percent)
                            self.progress.emit(f"다운로드 중... {percent}%")
                        except:
                            self.progress.emit("다운로드 중...")
                elif d['status'] == 'finished':
                    self.progress.emit("다운로드 완료, 후처리 중...")
                    self.progress_percent.emit(100)
            
            # yt-dlp 옵션 설정
            ydl_opts = {
                'outtmpl': os.path.join(self.save_path, '%(title)s.%(ext)s'),
                'progress_hooks': [progress_hook],
                'quiet': False,
                'no_warnings': False,
            }
            
            # 품질 설정
            if self.quality == 'best':
                if self.format_type == 'video':
                    ydl_opts['format'] = 'best[ext=mp4]/best'
                else:  # audio
                    ydl_opts['format'] = 'bestaudio[ext=m4a]/bestaudio'
                    ydl_opts['postprocessors'] = [{
                        'key': 'FFmpegExtractAudio',
                        'preferredcodec': 'mp3',
                        'preferredquality': '192',
                    }]
            elif self.quality == 'worst':
                if self.format_type == 'video':
                    ydl_opts['format'] = 'worst[ext=mp4]/worst'
                else:  # audio
                    ydl_opts['format'] = 'worstaudio[ext=m4a]/worstaudio'
                    ydl_opts['postprocessors'] = [{
                        'key': 'FFmpegExtractAudio',
                        'preferredcodec': 'mp3',
                        'preferredquality': '128',
                    }]
            else:  # 특정 해상도
                if self.format_type == 'video':
                    ydl_opts['format'] = f'best[height<={self.quality}][ext=mp4]/best[height<={self.quality}]'
                else:  # audio
                    ydl_opts['format'] = 'bestaudio[ext=m4a]/bestaudio'
                    ydl_opts['postprocessors'] = [{
                        'key': 'FFmpegExtractAudio',
                        'preferredcodec': 'mp3',
                        'preferredquality': '192',
                    }]
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([self.url])
            
            self.progress.emit("다운로드가 완료되었습니다!")
            self.finished.emit(True, f"비디오가 성공적으로 다운로드되었습니다!\n저장 위치: {self.save_path}")
            
        except Exception as e:
            self.finished.emit(False, f"다운로드 실패: {str(e)}")


class YouTubeThumbnailGUI(QMainWindow):
    """YouTube 비디오 정보 확인, 썸네일 및 비디오 다운로더 메인 GUI"""
    
    def __init__(self):
        super().__init__()
        self.init_ui()
        self.downloader = None
        self.video_downloader = None
        self.info_extractor = None
        self.video_data = None
        
        # 기본 저장 경로 설정 (OS별)
        if platform.system() == "Windows":
            self.default_save_path = os.path.join(os.path.expanduser("~"), "Desktop")
        else:  # macOS, Linux
            self.default_save_path = os.path.join(os.path.expanduser("~"), "Desktop")
        
        self.save_path = self.default_save_path
        self.video_save_path = self.default_save_path
        self.path_label.setText(f"저장 경로: {self.save_path}")
        self.video_path_label.setText(f"저장 경로: {self.video_save_path}")
    
    def init_ui(self):
        """UI 초기화"""
        self.setWindowTitle("YouTube 비디오 정보 & 다운로더")
        self.setGeometry(100, 100, 800, 700)
        
        # 중앙 위젯 설정
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        # 메인 레이아웃
        layout = QVBoxLayout(central_widget)
        
        # 제목
        title_label = QLabel("YouTube 비디오 정보 & 다운로더")
        title_font = QFont()
        title_font.setPointSize(16)
        title_font.setBold(True)
        title_label.setFont(title_font)
        title_label.setAlignment(Qt.AlignCenter)
        layout.addWidget(title_label)
        
        # URL 입력 그룹
        url_group = QGroupBox("YouTube URL")
        url_layout = QVBoxLayout(url_group)
        
        # URL 입력
        self.url_input = QLineEdit()
        self.url_input.setPlaceholderText("YouTube URL을 입력하세요 (예: https://www.youtube.com/watch?v=...)")
        url_layout.addWidget(self.url_input)
        
        # 버튼 레이아웃
        button_layout = QHBoxLayout()
        
        # 정보 가져오기 버튼
        self.info_button = QPushButton("비디오 정보 가져오기")
        self.info_button.clicked.connect(self.get_video_info)
        button_layout.addWidget(self.info_button)
        
        # QR 코드 생성 버튼
        self.qr_button = QPushButton("QR 코드 생성")
        self.qr_button.clicked.connect(self.generate_qr_code)
        self.qr_button.setEnabled(False)
        button_layout.addWidget(self.qr_button)
        
        url_layout.addLayout(button_layout)
        layout.addWidget(url_group)
        
        # 탭 위젯 생성
        self.tab_widget = QTabWidget()
        
        # 비디오 정보 탭
        self.info_tab = self.create_info_tab()
        self.tab_widget.addTab(self.info_tab, "비디오 정보")
        
        # 댓글 탭
        self.comments_tab = self.create_comments_tab()
        self.tab_widget.addTab(self.comments_tab, "댓글")
        
        # 썸네일 다운로드 탭
        self.download_tab = self.create_download_tab()
        self.tab_widget.addTab(self.download_tab, "썸네일 다운로드")
        
        # 비디오 다운로드 탭
        self.video_download_tab = self.create_video_download_tab()
        self.tab_widget.addTab(self.video_download_tab, "비디오 다운로드")
        
        layout.addWidget(self.tab_widget)
        
        # 진행 상황 표시
        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        layout.addWidget(self.progress_bar)
        
        # 로그 출력
        log_group = QGroupBox("로그")
        log_layout = QVBoxLayout(log_group)
        
        self.log_text = QTextEdit()
        self.log_text.setMaximumHeight(100)
        self.log_text.setReadOnly(True)
        log_layout.addWidget(self.log_text)
        
        layout.addWidget(log_group)
        
        # 초기 로그 메시지
        self.add_log("프로그램이 시작되었습니다.")
        self.add_log(f"현재 OS: {platform.system()}")
    
    def create_info_tab(self):
        """비디오 정보 탭 생성"""
        tab = QWidget()
        layout = QVBoxLayout(tab)
        
        # 비디오 정보 표시 영역
        info_scroll = QScrollArea()
        info_widget = QWidget()
        self.info_layout = QVBoxLayout(info_widget)
        
        # 기본 메시지
        self.info_label = QLabel("URL을 입력하고 '비디오 정보 가져오기' 버튼을 클릭하세요.")
        self.info_label.setAlignment(Qt.AlignCenter)
        self.info_layout.addWidget(self.info_label)
        
        info_scroll.setWidget(info_widget)
        info_scroll.setWidgetResizable(True)
        layout.addWidget(info_scroll)
        
        return tab
    
    def create_comments_tab(self):
        """댓글 탭 생성"""
        tab = QWidget()
        layout = QVBoxLayout(tab)
        
        # 댓글 표시 영역
        self.comments_text = QTextEdit()
        self.comments_text.setReadOnly(True)
        self.comments_text.setPlainText("비디오 정보를 먼저 가져와주세요.")
        layout.addWidget(self.comments_text)
        
        return tab
    
    def create_download_tab(self):
        """썸네일 다운로드 탭 생성"""
        tab = QWidget()
        layout = QVBoxLayout(tab)
        
        # 설정 그룹
        settings_group = QGroupBox("다운로드 설정")
        settings_layout = QGridLayout(settings_group)
        
        # 품질 선택
        quality_label = QLabel("썸네일 품질:")
        self.quality_combo = QComboBox()
        
        # 품질 옵션 추가 (텍스트와 데이터 분리)
        quality_options = [
            ("최고 해상도", "maxres"),
            ("고품질", "high"), 
            ("중간 품질", "medium"),
            ("표준 품질", "standard"),
            ("기본", "default")
        ]
        
        for text, data in quality_options:
            self.quality_combo.addItem(text, data)
        
        settings_layout.addWidget(quality_label, 0, 0)
        settings_layout.addWidget(self.quality_combo, 0, 1)
        
        # 저장 경로
        path_label = QLabel("저장 경로:")
        self.path_label = QLabel()
        self.browse_button = QPushButton("찾아보기")
        self.browse_button.clicked.connect(self.browse_save_path)
        
        settings_layout.addWidget(path_label, 1, 0)
        settings_layout.addWidget(self.path_label, 1, 1)
        settings_layout.addWidget(self.browse_button, 1, 2)
        
        layout.addWidget(settings_group)
        
        # 다운로드 버튼
        self.download_button = QPushButton("썸네일 다운로드")
        self.download_button.clicked.connect(self.download_thumbnail)
        self.download_button.setMinimumHeight(40)
        layout.addWidget(self.download_button)
        
        return tab
    
    def create_video_download_tab(self):
        """비디오 다운로드 탭 생성"""
        tab = QWidget()
        layout = QVBoxLayout(tab)
        
        # 설정 그룹
        settings_group = QGroupBox("비디오 다운로드 설정")
        settings_layout = QGridLayout(settings_group)
        
        # 다운로드 타입 선택
        type_label = QLabel("다운로드 타입:")
        self.video_type_combo = QComboBox()
        self.video_type_combo.addItem("비디오 (MP4)", "video")
        self.video_type_combo.addItem("오디오만 (MP3)", "audio")
        settings_layout.addWidget(type_label, 0, 0)
        settings_layout.addWidget(self.video_type_combo, 0, 1)
        
        # 품질 선택
        video_quality_label = QLabel("비디오 품질:")
        self.video_quality_combo = QComboBox()
        
        # 품질 옵션 추가
        video_quality_options = [
            ("최고 품질", "best"),
            ("1080p", "1080"),
            ("720p", "720"),
            ("480p", "480"),
            ("360p", "360"),
            ("최저 품질", "worst")
        ]
        
        for text, data in video_quality_options:
            self.video_quality_combo.addItem(text, data)
        
        settings_layout.addWidget(video_quality_label, 1, 0)
        settings_layout.addWidget(self.video_quality_combo, 1, 1)
        
        # 저장 경로 (썸네일과 동일한 경로 사용)
        video_path_label = QLabel("저장 경로:")
        self.video_path_label = QLabel()
        self.video_browse_button = QPushButton("찾아보기")
        self.video_browse_button.clicked.connect(self.browse_video_save_path)
        
        settings_layout.addWidget(video_path_label, 2, 0)
        settings_layout.addWidget(self.video_path_label, 2, 1)
        settings_layout.addWidget(self.video_browse_button, 2, 2)
        
        layout.addWidget(settings_group)
        
        # 다운로드 진행률
        progress_group = QGroupBox("다운로드 진행률")
        progress_layout = QVBoxLayout(progress_group)
        
        self.video_progress_bar = QProgressBar()
        self.video_progress_bar.setVisible(False)
        progress_layout.addWidget(self.video_progress_bar)
        
        layout.addWidget(progress_group)
        
        # 다운로드 버튼
        self.video_download_button = QPushButton("비디오 다운로드")
        self.video_download_button.clicked.connect(self.download_video)
        self.video_download_button.setMinimumHeight(40)
        layout.addWidget(self.video_download_button)
        
        return tab
    
    def get_video_info(self):
        """비디오 정보 가져오기"""
        url = self.url_input.text().strip()
        
        if not url:
            QMessageBox.warning(self, "경고", "YouTube URL을 입력해주세요.")
            return
        
        if not self.validate_youtube_url(url):
            QMessageBox.warning(self, "경고", "올바른 YouTube URL을 입력해주세요.")
            return
        
        # UI 상태 변경
        self.info_button.setEnabled(False)
        self.progress_bar.setVisible(True)
        self.progress_bar.setRange(0, 0)  # 무한 진행바
        
        self.add_log(f"비디오 정보 가져오기 시작: {url}")
        
        # 정보 추출 스레드 시작
        self.info_extractor = VideoInfoExtractor(url)
        self.info_extractor.progress.connect(self.update_progress)
        self.info_extractor.finished.connect(self.info_extraction_finished)
        self.info_extractor.start()
    
    def info_extraction_finished(self, success, data):
        """정보 추출 완료 처리"""
        # UI 상태 복원
        self.info_button.setEnabled(True)
        self.progress_bar.setVisible(False)
        
        if success:
            self.video_data = data
            self.qr_button.setEnabled(True)
            self.display_video_info(data)
            self.display_comments(data.get('comments', []))
            self.add_log("비디오 정보 가져오기 완료!")
        else:
            QMessageBox.critical(self, "오류", f"정보 가져오기 실패: {data.get('error', '알 수 없는 오류')}")
            self.add_log(f"오류: {data.get('error', '알 수 없는 오류')}")
    
    def display_video_info(self, data):
        """비디오 정보 표시"""
        # 기존 위젯들 제거
        for i in reversed(range(self.info_layout.count())): 
            self.info_layout.itemAt(i).widget().setParent(None)
        
        # 비디오 제목
        title_label = QLabel(f"제목: {data['title']}")
        title_font = QFont()
        title_font.setBold(True)
        title_font.setPointSize(12)
        title_label.setFont(title_font)
        title_label.setWordWrap(True)
        self.info_layout.addWidget(title_label)
        
        # 채널명
        uploader_label = QLabel(f"채널: {data['uploader']}")
        self.info_layout.addWidget(uploader_label)
        
        # 조회수
        view_count = data['view_count']
        view_text = f"조회수: {view_count:,}회" if view_count else "조회수: 정보 없음"
        view_label = QLabel(view_text)
        self.info_layout.addWidget(view_label)
        
        # 좋아요 수
        like_count = data['like_count']
        like_text = f"좋아요: {like_count:,}개" if like_count else "좋아요: 정보 없음"
        like_label = QLabel(like_text)
        like_font = QFont()
        like_font.setBold(True)
        like_label.setFont(like_font)
        like_label.setStyleSheet("color: #ff0000;")
        self.info_layout.addWidget(like_label)
        
        # 업로드 날짜
        upload_date = data['upload_date']
        if upload_date and upload_date != 'Unknown':
            # YYYYMMDD 형식을 YYYY-MM-DD로 변환
            try:
                formatted_date = f"{upload_date[:4]}-{upload_date[4:6]}-{upload_date[6:8]}"
                date_label = QLabel(f"업로드 날짜: {formatted_date}")
            except:
                date_label = QLabel(f"업로드 날짜: {upload_date}")
        else:
            date_label = QLabel("업로드 날짜: 정보 없음")
        self.info_layout.addWidget(date_label)
        
        # 영상 길이
        duration = data['duration']
        if duration:
            minutes = duration // 60
            seconds = duration % 60
            duration_text = f"길이: {minutes}분 {seconds}초"
        else:
            duration_text = "길이: 정보 없음"
        duration_label = QLabel(duration_text)
        self.info_layout.addWidget(duration_label)
        
        # 설명 (처음 200자만)
        description = data['description']
        if description:
            short_desc = description[:200] + "..." if len(description) > 200 else description
            desc_label = QLabel(f"설명:\n{short_desc}")
            desc_label.setWordWrap(True)
            desc_label.setMaximumHeight(100)
            self.info_layout.addWidget(desc_label)
        
        self.info_layout.addStretch()
    
    def display_comments(self, comments):
        """댓글 표시"""
        if not comments:
            self.comments_text.setPlainText("댓글 정보를 가져올 수 없습니다.")
            return
        
        comment_text = f"총 댓글 수: {len(comments)}개\n\n"
        
        # 최대 50개 댓글만 표시
        for i, comment in enumerate(comments[:50]):
            author = comment.get('author', '익명')
            text = comment.get('text', '')
            like_count = comment.get('like_count', 0)
            
            comment_text += f"[{i+1}] {author}\n"
            comment_text += f"{text}\n"
            if like_count > 0:
                comment_text += f"👍 {like_count}\n"
            comment_text += "-" * 50 + "\n\n"
        
        if len(comments) > 50:
            comment_text += f"\n... 그리고 {len(comments) - 50}개의 댓글이 더 있습니다."
        
        self.comments_text.setPlainText(comment_text)
    
    def generate_qr_code(self):
        """QR 코드 생성"""
        if not self.video_data:
            QMessageBox.warning(self, "경고", "먼저 비디오 정보를 가져와주세요.")
            return
        
        try:
            # QR 코드 생성
            url = self.video_data['url']
            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_L,
                box_size=10,
                border=4,
            )
            qr.add_data(url)
            qr.make(fit=True)
            
            # QR 코드 이미지 생성
            qr_img = qr.make_image(fill_color="black", back_color="white")
            
            # 파일 저장 대화상자
            safe_title = re.sub(r'[<>:"/\\|?*]', '_', self.video_data['title'])
            default_filename = f"{safe_title}_QR.png"
            file_path, _ = QFileDialog.getSaveFileName(
                self, 
                "QR 코드 저장", 
                os.path.join(self.save_path, default_filename),
                "PNG files (*.png);;All Files (*)"
            )
            
            if file_path:
                qr_img.save(file_path)
                QMessageBox.information(self, "성공", f"QR 코드가 저장되었습니다:\n{file_path}")
                self.add_log(f"QR 코드 생성 완료: {file_path}")
            
        except Exception as e:
            QMessageBox.critical(self, "오류", f"QR 코드 생성 실패: {str(e)}")
            self.add_log(f"QR 코드 생성 오류: {str(e)}")
    
    def browse_save_path(self):
        """저장 경로 선택"""
        folder = QFileDialog.getExistingDirectory(self, "저장 경로 선택", self.save_path)
        if folder:
            self.save_path = folder
            self.path_label.setText(f"저장 경로: {self.save_path}")
            self.add_log(f"저장 경로 변경: {self.save_path}")
    
    def browse_video_save_path(self):
        """비디오 저장 경로 선택"""
        folder = QFileDialog.getExistingDirectory(self, "비디오 저장 경로 선택", self.video_save_path)
        if folder:
            self.video_save_path = folder
            self.video_path_label.setText(f"저장 경로: {self.video_save_path}")
            self.add_log(f"비디오 저장 경로 변경: {self.video_save_path}")
    
    def download_video(self):
        """비디오 다운로드 시작"""
        if not self.video_data:
            QMessageBox.warning(self, "경고", "먼저 비디오 정보를 가져와주세요.")
            return
        
        if not os.path.exists(self.video_save_path):
            QMessageBox.warning(self, "경고", "저장 경로가 존재하지 않습니다.")
            return
        
        # UI 상태 변경
        self.video_download_button.setEnabled(False)
        self.video_progress_bar.setVisible(True)
        self.video_progress_bar.setValue(0)
        
        # 선택된 품질과 타입 가져오기
        quality_data = self.video_quality_combo.currentData()
        type_data = self.video_type_combo.currentData()
        
        if quality_data is None:
            quality = "best"
        else:
            quality = quality_data
            
        if type_data is None:
            format_type = "video"
        else:
            format_type = type_data
        
        self.add_log(f"비디오 다운로드 시작")
        self.add_log(f"타입: {self.video_type_combo.currentText()}")
        self.add_log(f"품질: {self.video_quality_combo.currentText()}")
        
        # 다운로더 스레드 시작
        self.video_downloader = VideoDownloader(
            self.video_data['url'], 
            self.video_save_path, 
            quality, 
            format_type
        )
        self.video_downloader.progress.connect(self.update_progress)
        self.video_downloader.progress_percent.connect(self.update_video_progress)
        self.video_downloader.finished.connect(self.video_download_finished)
        self.video_downloader.start()
    
    def update_video_progress(self, percent):
        """비디오 다운로드 진행률 업데이트"""
        self.video_progress_bar.setValue(percent)
    
    def video_download_finished(self, success, message):
        """비디오 다운로드 완료 처리"""
        # UI 상태 복원
        self.video_download_button.setEnabled(True)
        self.video_progress_bar.setVisible(False)
        
        if success:
            QMessageBox.information(self, "성공", message)
            self.add_log("비디오 다운로드 완료!")
        else:
            QMessageBox.critical(self, "오류", message)
            self.add_log(f"오류: {message}")
    
    def validate_youtube_url(self, url):
        """YouTube URL 유효성 검사"""
        youtube_patterns = [
            r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([a-zA-Z0-9_-]{11})',
            r'youtube\.com/watch\?.*v=([a-zA-Z0-9_-]{11})'
        ]
        
        for pattern in youtube_patterns:
            if re.search(pattern, url):
                return True
        return False
    
    def download_thumbnail(self):
        """썸네일 다운로드 시작"""
        if not self.video_data:
            QMessageBox.warning(self, "경고", "먼저 비디오 정보를 가져와주세요.")
            return
        
        if not os.path.exists(self.save_path):
            QMessageBox.warning(self, "경고", "저장 경로가 존재하지 않습니다.")
            return
        
        # UI 상태 변경
        self.download_button.setEnabled(False)
        self.progress_bar.setVisible(True)
        self.progress_bar.setRange(0, 0)  # 무한 진행바
        
        # 선택된 품질 가져오기
        quality_data = self.quality_combo.currentData()
        if quality_data is None:
            quality = "maxres"
        else:
            quality = quality_data
        
        self.add_log(f"썸네일 다운로드 시작")
        self.add_log(f"품질: {self.quality_combo.currentText()}")
        
        # 다운로더 스레드 시작
        self.downloader = ThumbnailDownloader(self.video_data['url'], self.save_path, quality)
        self.downloader.progress.connect(self.update_progress)
        self.downloader.finished.connect(self.download_finished)
        self.downloader.start()
    
    def update_progress(self, message):
        """진행 상황 업데이트"""
        self.add_log(message)
    
    def download_finished(self, success, message):
        """다운로드 완료 처리"""
        # UI 상태 복원
        self.download_button.setEnabled(True)
        self.progress_bar.setVisible(False)
        
        if success:
            QMessageBox.information(self, "성공", message)
            self.add_log("다운로드 완료!")
        else:
            QMessageBox.critical(self, "오류", message)
            self.add_log(f"오류: {message}")
    
    def add_log(self, message):
        """로그 메시지 추가"""
        from datetime import datetime
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.log_text.append(f"[{timestamp}] {message}")
        # 스크롤을 맨 아래로
        self.log_text.verticalScrollBar().setValue(
            self.log_text.verticalScrollBar().maximum()
        )


def main():
    """메인 함수"""
    app = QApplication(sys.argv)
    
    # 애플리케이션 정보 설정
    app.setApplicationName("YouTube Video Info & Download Tool")
    app.setApplicationVersion("2.1")
    app.setOrganizationName("YT Video Tool")
    
    # 메인 윈도우 생성 및 실행
    window = YouTubeThumbnailGUI()
    window.show()
    
    sys.exit(app.exec_())


if __name__ == "__main__":
    main()