const ExcelJS = require("exceljs");
const FileSaver = require("file-saver");

const DEFAULT_FILE_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8";
const DEFAULT_FILE_EXTENSION = ".xlsx";
const WIDTH_ERROR_MARGIN = 1.3;

const generateSheet = async (workbook, sheet, apiExcelDatas) => {
  const {
    workSheet: { name, ...workSheetProps },
    colValidations,
    rowLayouts,
    colLayouts,
    cellDatas,
    images,
  } = sheet;

  const {
    startRowNum = Infinity,
    newRows = [],
    customValues = [],
    insertColNum = Infinity,
    newCols = [],
  } = apiExcelDatas;

  const isExistApiData = newRows.length > 0;

  const { defaultColWidth } = workSheetProps.properties;
  const { sheet: isProtectedSheet, ...protectionOptions } =
    workSheetProps.sheetProtection || { sheet: false };

  const getMovedColNum = (colNum) => colNum + newCols.length;
  const isMovedCol = (colNum) => colNum >= insertColNum;

  // Step 01. workbook 파일 props 지정
  const newWorkSheet = workbook.addWorksheet(name, workSheetProps);

  // Step 02. Row 스타일 지정
  rowLayouts.forEach(({ number, style, height }) => {
    const isLayoutArea = !isExistApiData || number < startRowNum;

    if (isLayoutArea) {
      newWorkSheet.getRow(number).style = style;
      newWorkSheet.getRow(number).height = height;
    }
  });

  // Step 03. Cell 기본 스타일 및 정보 입력
  const defaultCells = isExistApiData
    ? cellDatas.filter(({ row }) => row < startRowNum)
    : cellDatas;

  defaultCells.forEach(({ style, value, note, col, row }) => {
    const targetColNum = isMovedCol(col) ? getMovedColNum(col) : col;

    newWorkSheet.getCell(row, targetColNum).value = value;
    newWorkSheet.getCell(row, targetColNum).style = style;

    if (note) {
      newWorkSheet.getCell(row, targetColNum).note = note;
    }
  });

  // Step 04. 새롭게 추가된 col에 대한 value 및 style 추가
  newCols.forEach(({ rowNum, value }, index) => {
    const targetColNum = insertColNum + index;
    newWorkSheet.getColumn(targetColNum).eachCell(({ address, row }) => {
      const basedCellStyle = defaultCells.find(
        (e) => e.address === address
      ).style;
      newWorkSheet.getCell(address).style = { ...basedCellStyle };

      if (rowNum === row) {
        newWorkSheet.getCell(address).value = value;
      }
    });
  });

  // Step 05. Col 스타일 지정
  const newWorkSheetCols = [];
  const newColsLength = newCols.length;

  colLayouts.forEach(({ width, number, letter, ...extraProps }) => {
    // Step 05-(1). 셀 너비가 정상적으로 반영되지 않는 이슈가 존재. 대충 비슷하게 맞추기 위해 임의의 상수 부여
    const changedProps = {
      number,
      width: (width || defaultColWidth) * WIDTH_ERROR_MARGIN,
    };

    if (isMovedCol(number)) {
      if (number === insertColNum) {
        newCols.forEach((col, index) => {
          changedProps.number = number + index;
          newWorkSheetCols.push({ ...extraProps, ...changedProps });
        });
      }
      changedProps.number = number + newColsLength;
    }
    newWorkSheetCols.push({ ...extraProps, ...changedProps });
  });

  newWorkSheet.columns = newWorkSheetCols;

  // Step 06. 데이터 삽입 및 validation, style 지정
  if (isExistApiData) {
    newRows.forEach(async (newRow) => {
      await newWorkSheet.addRow(newRow);
    });

    // Step 06-(1). style 기준이 되는 첫 번째 row 의 Cell 필터
    const tableFirstCells = cellDatas.filter(({ row }) => row === startRowNum);

    tableFirstCells.forEach(({ style, col, row }) => {
      const targetColNum = isMovedCol(col) ? getMovedColNum(col) : col;

      for (let i = 0; i <= newRows.length; i++) {
        // Step 06-(2). 삽입된 데이터 Cell 에 스타일 및 validation 지정
        if (colValidations[col]) {
          newWorkSheet.getCell(row + i, targetColNum).dataValidation =
            colValidations[col].dataValidation;
        }

        newWorkSheet.getCell(row + i, targetColNum).style = style;

        if (col === insertColNum) {
          // Step 06-(3). 새로 추가된 cols 에 대한 style 을 "삽입된 col" style 과 동일하게 설정
          // ex) 5번과 6번 사이에 새로운 column 을 추가할 경우, 새롭게 추가되는 column 들은 6 번 style 을 따라감
          newCols.forEach((newCol, index) => {
            const targetStyle = tableFirstCells.find(
              (e) => e.col === insertColNum
            ).style;
            newWorkSheet.getCell(row + i, insertColNum + index).style =
              targetStyle;
          });
        }
      }
    });
  }

  // Step 07. 커스텀 value 삽입
  customValues.forEach(({ address, value, note }) => {
    newWorkSheet.getCell(address).value = value;
    if (note) {
      newWorkSheet.getCell(address).note = note;
    }
  });

  // Step 08. Image 삽입
  images.forEach(({ range, imageUrl }) => {
    if (imageUrl) {
      const extension = imageUrl.split(";")[0].split("/")[1];

      const imageId = workbook.addImage({
        // As-Is
        base64: imageUrl,
        extension,

        // To-Be: Local Image 나 직접 upload 한 Image Url 로 변경 필요 (해당 코드에서는 range 만 참고)
        // filename: 'path/to/image.jpg',
        // extension: 'png',
      });

      newWorkSheet.addImage(imageId, range);
    }
  });

  // Step 09. Sheet 암호 설정 (기본 "vendys123!")
  if (isProtectedSheet) {
    const sheetPassword =
      "vendys123!" || prompt(`${name} Sheet의 비밀번호를 입력해주세요.`);

    if (sheetPassword) {
      await newWorkSheet.protect(sheetPassword, protectionOptions);
    }
  }
};

const setWorkbookProperties = (workbook, workbookProps) => {
  const { created, creator, lastModifiedBy, modified, views, properties } =
    workbookProps;
  const { date1904, ...extraProps } = properties;

  const newWorkbookProps = {
    creator,
    created: new Date(created),
    lastModifiedBy,
    modified: new Date(modified),
    views,
    properties: { date1904, ...extraProps },
  };

  Object.assign(workbook, newWorkbookProps);
};

const generateBook = (
  workbook,
  sheetDatas,
  apiExcelDatas = {} // Info: API를 통해 받아온 데이터 및 커스텀 options
) => {
  return new Promise((resolve, reject) => {
    try {
      Object.keys(sheetDatas)
        .sort() // Warning: 문자형으로 sorting하기 때문에 10개 이상의 sheet가 존재할 경우 비정상적으로 동작함
        .forEach((sheetId) => {
          if (sheetId === "workbook") {
            setWorkbookProperties(workbook, sheetDatas[sheetId]);
          } else {
            generateSheet(
              workbook,
              sheetDatas[sheetId],
              apiExcelDatas[sheetId] || {}
            );
          }
        });

      resolve(workbook);
    } catch (error) {
      reject(error);
    }
  });
};

const handleFileExport = async (sheetDatas, apiExcelDatas, fileName) => {
  const workbook = new ExcelJS.Workbook();
  const newWorkbook = await generateBook(workbook, sheetDatas, apiExcelDatas);

  if (Object.keys(sheetDatas).length > 0) {
    newWorkbook.xlsx
      .writeBuffer()
      .then((buffer) => {
        const excelData = new Blob([buffer], { type: DEFAULT_FILE_TYPE });
        FileSaver.saveAs(excelData, fileName + DEFAULT_FILE_EXTENSION);
      })
      .catch((error) => {
        console.error("Error saving file:", error);
      });
  } else {
    alert("업로드된 파일이 없습니다");
  }
};

export default handleFileExport;