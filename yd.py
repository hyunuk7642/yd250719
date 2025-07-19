#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
YouTube Thumbnail Downloader GUI
Windows와 macOS에서 모두 동작하는 YouTube 썸네일 다운로더
"""

import sys
import os
import re
import requests
from urllib.parse import urlparse, parse_qs
from pathlib import Path
import platform

from PyQt5.QtWidgets import (QApplication, QMainWindow, QVBoxLayout, QHBoxLayout, 
                            QWidget, QLabel, QLineEdit, QPushButton, QTextEdit, 
                            QFileDialog, QMessageBox, QProgressBar, QComboBox,
                            QGroupBox, QGridLayout)
from PyQt5.QtCore import QThread, pyqtSignal, Qt
from PyQt5.QtGui import QPixmap, QFont, QIcon
from PIL import Image
import yt_dlp


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


class YouTubeThumbnailGUI(QMainWindow):
    """YouTube 썸네일 다운로더 메인 GUI"""
    
    def __init__(self):
        super().__init__()
        self.init_ui()
        self.downloader = None
        
        # 기본 저장 경로 설정 (OS별)
        if platform.system() == "Windows":
            self.default_save_path = os.path.join(os.path.expanduser("~"), "Desktop")
        else:  # macOS, Linux
            self.default_save_path = os.path.join(os.path.expanduser("~"), "Desktop")
        
        self.save_path = self.default_save_path
        self.path_label.setText(f"저장 경로: {self.save_path}")
    
    def init_ui(self):
        """UI 초기화"""
        self.setWindowTitle("YouTube 썸네일 다운로더")
        self.setGeometry(100, 100, 600, 500)
        
        # 중앙 위젯 설정
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        # 메인 레이아웃
        layout = QVBoxLayout(central_widget)
        
        # 제목
        title_label = QLabel("YouTube 썸네일 다운로더")
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
        
        layout.addWidget(url_group)
        
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
        
        # 진행 상황 표시
        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        layout.addWidget(self.progress_bar)
        
        # 로그 출력
        log_group = QGroupBox("로그")
        log_layout = QVBoxLayout(log_group)
        
        self.log_text = QTextEdit()
        self.log_text.setMaximumHeight(150)
        self.log_text.setReadOnly(True)
        log_layout.addWidget(self.log_text)
        
        layout.addWidget(log_group)
        
        # 초기 로그 메시지
        self.add_log("프로그램이 시작되었습니다.")
        self.add_log(f"현재 OS: {platform.system()}")
    
    def browse_save_path(self):
        """저장 경로 선택"""
        folder = QFileDialog.getExistingDirectory(self, "저장 경로 선택", self.save_path)
        if folder:
            self.save_path = folder
            self.path_label.setText(f"저장 경로: {self.save_path}")
            self.add_log(f"저장 경로 변경: {self.save_path}")
    
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
        url = self.url_input.text().strip()
        
        if not url:
            QMessageBox.warning(self, "경고", "YouTube URL을 입력해주세요.")
            return
        
        if not self.validate_youtube_url(url):
            QMessageBox.warning(self, "경고", "올바른 YouTube URL을 입력해주세요.")
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
        
        self.add_log(f"다운로드 시작: {url}")
        self.add_log(f"품질: {self.quality_combo.currentText()}")
        
        # 다운로더 스레드 시작
        self.downloader = ThumbnailDownloader(url, self.save_path, quality)
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
    app.setApplicationName("YouTube Thumbnail Downloader")
    app.setApplicationVersion("1.0")
    app.setOrganizationName("YT Thumbnail Tool")
    
    # 메인 윈도우 생성 및 실행
    window = YouTubeThumbnailGUI()
    window.show()
    
    sys.exit(app.exec_())


if __name__ == "__main__":
    main()