/**
 * Tests for PathBuilder module
 */

import path from 'path';
import {
  sanitizeCourseCode,
  sanitizeModuleName,
  sanitizeTitle,
  sanitizeFolderPath,
  PathBuilder,
  createPathBuilder,
} from '../../src/layers/l0-utilities/PathBuilder';

describe('sanitizeCourseCode', () => {
  it('should strip special characters and preserve alphanumeric, hyphens, dots, and underscores', () => {
    expect(sanitizeCourseCode('CSC108-2024')).toBe('CSC108-2024');
    expect(sanitizeCourseCode('CS_101')).toBe('CS_101');
    expect(sanitizeCourseCode('MATH.1A')).toBe('MATH.1A');
    expect(sanitizeCourseCode('Course@#$Name')).toBe('Course___Name');
  });

  it('should replace spaces with underscores', () => {
    expect(sanitizeCourseCode('CSC 108')).toBe('CSC_108');
    expect(sanitizeCourseCode('Computer Science 101')).toBe('Computer_Science_101');
    expect(sanitizeCourseCode('CSC  108')).toBe('CSC_108'); // Multiple spaces
  });

  it('should handle empty strings', () => {
    expect(sanitizeCourseCode('')).toBe('');
  });

  it('should handle strings with only special characters', () => {
    expect(sanitizeCourseCode('@#$%^&*()')).toBe('_________');
  });

  it('should handle Unicode characters', () => {
    expect(sanitizeCourseCode('CSC108-Введение')).toBe('CSC108-________');
    expect(sanitizeCourseCode('课程-101')).toBe('__-101');
  });
});

describe('sanitizeModuleName', () => {
  it('should strip special characters and preserve alphanumeric, hyphens, dots, and underscores', () => {
    expect(sanitizeModuleName('Week-1')).toBe('Week-1');
    expect(sanitizeModuleName('Module_1')).toBe('Module_1');
    expect(sanitizeModuleName('Lecture.1')).toBe('Lecture.1');
    expect(sanitizeModuleName('Week@#$1')).toBe('Week___1');
  });

  it('should replace spaces with underscores', () => {
    expect(sanitizeModuleName('Week 1')).toBe('Week_1');
    expect(sanitizeModuleName('Introduction to Python')).toBe('Introduction_to_Python');
    expect(sanitizeModuleName('Week  1')).toBe('Week_1'); // Multiple spaces
  });

  it('should handle empty strings', () => {
    expect(sanitizeModuleName('')).toBe('');
  });

  it('should handle strings with only special characters', () => {
    expect(sanitizeModuleName('!@#$%')).toBe('_____');
  });

  it('should handle Unicode characters', () => {
    expect(sanitizeModuleName('Module-Урок')).toBe('Module-____');
    expect(sanitizeModuleName('模块-1')).toBe('__-1');
  });
});

describe('sanitizeTitle', () => {
  it('should remove path separators (/, \\) to prevent directory traversal', () => {
    expect(sanitizeTitle('Lab/Assignment')).toBe('Lab_Assignment');
    expect(sanitizeTitle('Lab\\Assignment')).toBe('Lab_Assignment');
    expect(sanitizeTitle('../../../etc/passwd')).toBe('.._.._.._etc_passwd');
  });

  it('should remove < > : " | ? * characters', () => {
    expect(sanitizeTitle('Lab<1>')).toBe('Lab_1_');
    expect(sanitizeTitle('Assignment: Part 1')).toBe('Assignment_ Part 1');
    expect(sanitizeTitle('File"Name')).toBe('File_Name');
    expect(sanitizeTitle('File|Name')).toBe('File_Name');
    expect(sanitizeTitle('File?Name')).toBe('File_Name');
    expect(sanitizeTitle('File*Name')).toBe('File_Name');
  });

  it('should truncate to default 50 characters', () => {
    const longTitle = 'A'.repeat(100);
    expect(sanitizeTitle(longTitle)).toBe('A'.repeat(50));
    expect(sanitizeTitle(longTitle).length).toBe(50);
  });

  it('should truncate to custom maxLength', () => {
    const longTitle = 'A'.repeat(100);
    expect(sanitizeTitle(longTitle, 20)).toBe('A'.repeat(20));
    expect(sanitizeTitle(longTitle, 20).length).toBe(20);
    expect(sanitizeTitle(longTitle, 10)).toBe('A'.repeat(10));
  });

  it('should handle short strings without truncating', () => {
    expect(sanitizeTitle('Lab 1')).toBe('Lab 1');
    expect(sanitizeTitle('Assignment', 100)).toBe('Assignment');
  });

  it('should handle empty strings', () => {
    expect(sanitizeTitle('')).toBe('');
  });

  it('should handle strings with only special characters', () => {
    expect(sanitizeTitle('<>:"/\\|?*')).toBe('_________');
  });

  it('should preserve spaces and alphanumeric characters', () => {
    expect(sanitizeTitle('Lab 1 Assignment')).toBe('Lab 1 Assignment');
    expect(sanitizeTitle('Test-123_ABC')).toBe('Test-123_ABC');
  });

  it('should handle Unicode characters', () => {
    expect(sanitizeTitle('Лекция 1')).toBe('Лекция 1');
    expect(sanitizeTitle('课程作业')).toBe('课程作业');
  });
});

describe('sanitizeFolderPath', () => {
  it('should handle nested paths with forward slashes', () => {
    const result = sanitizeFolderPath('Lectures/Week 1');
    const expected = path.join('Lectures', 'Week_1');
    expect(result).toBe(expected);
  });

  it('should handle deeply nested paths', () => {
    const result = sanitizeFolderPath('Course/Module/Week 1/Lab 2');
    const expected = path.join('Course', 'Module', 'Week_1', 'Lab_2');
    expect(result).toBe(expected);
  });

  it('should strip special characters from each segment', () => {
    const result = sanitizeFolderPath('Lectures@/Week#1/Lab$2');
    const expected = path.join('Lectures_', 'Week_1', 'Lab_2');
    expect(result).toBe(expected);
  });

  it('should replace spaces with underscores in each segment', () => {
    const result = sanitizeFolderPath('Introduction to Python/Week 1');
    const expected = path.join('Introduction_to_Python', 'Week_1');
    expect(result).toBe(expected);
  });

  it('should handle empty segments', () => {
    // Double slash creates an empty segment which is preserved by split/join
    const result = sanitizeFolderPath('Lectures//Week 1');
    expect(result).toBe('Lectures' + path.sep + path.sep + 'Week_1');
  });

  it('should handle single segment paths', () => {
    expect(sanitizeFolderPath('Lectures')).toBe('Lectures');
    expect(sanitizeFolderPath('Week 1')).toBe('Week_1');
  });

  it('should handle empty strings', () => {
    expect(sanitizeFolderPath('')).toBe('');
  });

  it('should preserve alphanumeric, hyphens, dots, and underscores in segments', () => {
    const result = sanitizeFolderPath('Module-1/Lecture.1/Week_1');
    const expected = path.join('Module-1', 'Lecture.1', 'Week_1');
    expect(result).toBe(expected);
  });
});

describe('PathBuilder', () => {
  let builder: PathBuilder;
  const filesDir = '/test/downloads';

  beforeEach(() => {
    builder = new PathBuilder({ filesDir });
  });

  describe('getCoursePath', () => {
    it('should return correct course path structure', () => {
      const result = builder.getCoursePath('CSC108');
      expect(result).toBe(path.join(filesDir, 'CSC108'));
    });

    it('should sanitize course code', () => {
      const result = builder.getCoursePath('CSC 108');
      expect(result).toBe(path.join(filesDir, 'CSC_108'));
    });

    it('should handle special characters in course code', () => {
      const result = builder.getCoursePath('CS@108');
      expect(result).toBe(path.join(filesDir, 'CS_108'));
    });
  });

  describe('getModulePath', () => {
    it('should return correct module path structure', () => {
      const result = builder.getModulePath('CSC108', 'Week 1');
      expect(result).toBe(path.join(filesDir, 'CSC108', 'Week_1'));
    });

    it('should sanitize both course code and module name', () => {
      const result = builder.getModulePath('CSC 108', 'Week@1');
      expect(result).toBe(path.join(filesDir, 'CSC_108', 'Week_1'));
    });
  });

  describe('getPageHtmlPath', () => {
    it('should return correct nested structure with .html extension', () => {
      const result = builder.getPageHtmlPath('CSC108', 'Week 1', 'Lab 0');
      // sanitizeTitle keeps spaces (only removes <>:"/\|?*)
      expect(result).toBe(path.join(filesDir, 'CSC108', 'Week_1', 'Lab 0.html'));
    });

    it('should sanitize all path components', () => {
      const result = builder.getPageHtmlPath('CS 108', 'Week@1', 'Lab:0');
      // sanitizeTitle replaces : with _
      expect(result).toBe(path.join(filesDir, 'CS_108', 'Week_1', 'Lab_0.html'));
    });

    it('should truncate long page titles', () => {
      const longTitle = 'A'.repeat(100);
      const result = builder.getPageHtmlPath('CSC108', 'Week 1', longTitle);
      const expectedTitle = 'A'.repeat(50);
      expect(result).toBe(
        path.join(filesDir, 'CSC108', 'Week_1', `${expectedTitle}.html`)
      );
    });

    it('should handle special characters in page title', () => {
      const result = builder.getPageHtmlPath('CSC108', 'Week 1', 'Lab<1>:Part*2');
      expect(result).toBe(path.join(filesDir, 'CSC108', 'Week_1', 'Lab_1__Part_2.html'));
    });
  });

  describe('getPageDependenciesPath', () => {
    it('should return correct path with _files suffix', () => {
      const result = builder.getPageDependenciesPath('CSC108', 'Week 1', 'Lab 0');
      // sanitizeTitle keeps spaces
      expect(result).toBe(path.join(filesDir, 'CSC108', 'Week_1', 'Lab 0_files'));
    });

    it('should sanitize all path components', () => {
      const result = builder.getPageDependenciesPath('CS 108', 'Week@1', 'Lab:0');
      expect(result).toBe(path.join(filesDir, 'CS_108', 'Week_1', 'Lab_0_files')); // : is replaced
    });

    it('should truncate long page titles', () => {
      const longTitle = 'A'.repeat(100);
      const result = builder.getPageDependenciesPath('CSC108', 'Week 1', longTitle);
      const expectedTitle = 'A'.repeat(50);
      expect(result).toBe(
        path.join(filesDir, 'CSC108', 'Week_1', `${expectedTitle}_files`)
      );
    });
  });

  describe('getRelativeFolderPath', () => {
    it('should return sanitized module name', () => {
      expect(builder.getRelativeFolderPath('Week 1')).toBe('Week_1');
      expect(builder.getRelativeFolderPath('Module@1')).toBe('Module_1');
    });

    it('should handle empty strings', () => {
      expect(builder.getRelativeFolderPath('')).toBe('');
    });
  });

  describe('getResourcePath', () => {
    it('should return correct resource path structure', () => {
      const result = builder.getResourcePath('CSC108', 'syllabus.pdf');
      expect(result).toBe(path.join(filesDir, 'CSC108', 'syllabus.pdf'));
    });

    it('should sanitize course code but preserve filename', () => {
      const result = builder.getResourcePath('CSC 108', 'syllabus.pdf');
      expect(result).toBe(path.join(filesDir, 'CSC_108', 'syllabus.pdf'));
    });

    it('should handle special characters in filename', () => {
      const result = builder.getResourcePath('CSC108', 'file:name*.pdf');
      expect(result).toBe(path.join(filesDir, 'CSC108', 'file:name*.pdf'));
    });
  });

  describe('getResourcePathWithFolder', () => {
    it('should return correct nested structure', () => {
      const result = builder.getResourcePathWithFolder(
        'CSC108',
        'Lectures/Week 1',
        'lecture.pdf'
      );
      expect(result).toBe(
        path.join(filesDir, 'CSC108', 'Lectures', 'Week_1', 'lecture.pdf')
      );
    });

    it('should sanitize course code and folder path but preserve filename', () => {
      const result = builder.getResourcePathWithFolder(
        'CS 108',
        'Week@1/Lab#2',
        'file.pdf'
      );
      expect(result).toBe(path.join(filesDir, 'CS_108', 'Week_1', 'Lab_2', 'file.pdf'));
    });

    it('should handle single-level folder paths', () => {
      const result = builder.getResourcePathWithFolder(
        'CSC108',
        'Lectures',
        'lecture.pdf'
      );
      expect(result).toBe(path.join(filesDir, 'CSC108', 'Lectures', 'lecture.pdf'));
    });

    it('should handle deeply nested folder paths', () => {
      const result = builder.getResourcePathWithFolder(
        'CSC108',
        'Course/Module/Week 1/Lab 2',
        'file.pdf'
      );
      expect(result).toBe(
        path.join(filesDir, 'CSC108', 'Course', 'Module', 'Week_1', 'Lab_2', 'file.pdf')
      );
    });
  });
});

describe('createPathBuilder', () => {
  it('should create a PathBuilder instance', () => {
    const builder = createPathBuilder('/test/downloads');
    expect(builder).toBeInstanceOf(PathBuilder);
  });

  it('should create a functional PathBuilder', () => {
    const builder = createPathBuilder('/test/downloads');
    const result = builder.getCoursePath('CSC108');
    expect(result).toBe(path.join('/test/downloads', 'CSC108'));
  });
});

describe('Edge cases', () => {
  let builder: PathBuilder;

  beforeEach(() => {
    builder = new PathBuilder({ filesDir: '/test' });
  });

  it('should handle very long strings with truncation', () => {
    const longTitle = 'A'.repeat(200);
    const result = builder.getPageHtmlPath('CSC108', 'Week 1', longTitle);
    const expectedTitle = 'A'.repeat(50);
    expect(result).toBe(path.join('/test', 'CSC108', 'Week_1', `${expectedTitle}.html`));
  });

  it('should handle strings with mixed special characters and valid characters', () => {
    // sanitizeCourseCode/ModuleName replaces @#$% with _, sanitizeTitle only replaces *
    const result = builder.getPageHtmlPath('CS@#108', 'Week$%1', 'Lab*&0');
    expect(result).toBe(path.join('/test', 'CS__108', 'Week__1', 'Lab_&0.html'));
  });

  it('should handle paths with multiple consecutive spaces', () => {
    expect(sanitizeCourseCode('CSC    108')).toBe('CSC_108');
    expect(sanitizeModuleName('Week    1')).toBe('Week_1');
  });

  it('should handle Unicode with mixed ASCII', () => {
    expect(sanitizeCourseCode('CSC108-课程')).toBe('CSC108-__');
    expect(sanitizeTitle('Лекция-Lecture 1')).toBe('Лекция-Lecture 1');
  });

  it('should handle empty folder paths in sanitizeFolderPath', () => {
    expect(sanitizeFolderPath('')).toBe('');
  });

  it('should handle paths with only special characters', () => {
    expect(sanitizeCourseCode('!@#$%^&*()')).toBe('__________');
    expect(sanitizeModuleName('!@#$%^&*()')).toBe('__________');
    expect(sanitizeTitle('!@#$%^&*()')).toBe('!@#$%^&_()');
  });

  it('should handle null-like edge cases gracefully', () => {
    expect(sanitizeCourseCode('null')).toBe('null');
    expect(sanitizeCourseCode('undefined')).toBe('undefined');
    expect(sanitizeTitle('null')).toBe('null');
  });
});
