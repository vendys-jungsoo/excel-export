// Prod
const ExcelJS = require("exceljs");
const FileSaver = require("file-saver");

const DEFAULT_FILE_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8";
const DEFAULT_FILE_EXTENSION = ".xlsx";
const DEFAULT_COL_WIDTH = 9;
const WIDTH_ERROR_MARGIN = 1.3;

const generateSheet = async (workbook, sheetLayout, sheetData) => {
  const {
    workSheet: { name, ...workSheetProps },
    colValidations = {},
    rowLayouts = [],
    colLayouts = [],
    cellDatas = [],
    images = [],
  } = sheetLayout;

  const {
    startRowNum = Infinity,
    newRows = [],
    customValues = [],
    insertColNum = Infinity,
    newCols = [],
    customFormulas = [],
  } = sheetData;

  const newRowsLength = newRows.length;
  const generateWithoutLayout = Object.keys(workSheetProps).length < 1;

  const { defaultColWidth } = workSheetProps?.properties || DEFAULT_COL_WIDTH;
  const { sheet: isProtectedSheet, ...protectionOptions } =
    workSheetProps?.sheetProtection || { sheet: false };

  const getMovedColNum = (colNum) => colNum + newCols.length;
  const isMovedCol = (colNum) => colNum >= insertColNum;

  // Step 01. workbook 파일 props 지정
  const newWorkSheet = workbook.addWorksheet(name, workSheetProps || {});

  // Step 02. Row 스타일 지정
  rowLayouts.forEach(({ number, style, height }) => {
    const isLayoutArea = !newRowsLength || number < startRowNum;

    if (isLayoutArea) {
      newWorkSheet.getRow(number).style = style;
      newWorkSheet.getRow(number).height = height;
    }
  });

  // Step 03. Cell 기본 스타일 및 정보 입력
  const defaultCells = newRowsLength
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
  if (newRowsLength) {
    newRows.forEach(async (newRow) => {
      await newWorkSheet.addRow(newRow);
    });

    // Step 06-(1). style 기준이 되는 첫 번째 row 의 Cell 필터
    const tableFirstCells = cellDatas.filter(({ row }) => row === startRowNum);

    tableFirstCells.forEach(({ style, col, row }) => {
      const targetColNum = isMovedCol(col) ? getMovedColNum(col) : col;

      for (let i = 0; i <= newRowsLength; i++) {
        // Step 06-(2). 삽입된 데이터 Cell 에 스타일 및 validation 지정
        if (colValidations && colValidations[col]) {
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

  // Step 08. 커스텀 formula 삽입
  customFormulas.forEach(({ startAddress, refAddress, formula }) => {
    const { row: startRowNum, col: startColNum } =
      newWorkSheet.getCell(startAddress);
    const targetColNum = isMovedCol(startColNum)
      ? getMovedColNum(startColNum)
      : startColNum;

    const { row: refRowNum, col: refColNum } = newWorkSheet.getCell(refAddress);
    const targetRefColNum = isMovedCol(refColNum)
      ? getMovedColNum(refColNum)
      : refColNum;

    for (let i = 0; i <= newRowsLength; i++) {
      const { address: targetAddress } = newWorkSheet.getCell(
        startRowNum + i,
        targetColNum
      );

      const { address: refAddress } = newWorkSheet.getCell(
        refRowNum + i,
        targetRefColNum
      );

      newWorkSheet.getCell(targetAddress).value = {
        formula: formula(refAddress),
      };
    }
  });

  // Step 08-1. 수식 적용하기 (수식에 다른 sheet 정보가 포함된 경우에는 fillFormula 사용 불가, https://github.com/exceljs/exceljs/issues/1766)
  // customFillFormulas.forEach(({ addressRange, formula, values }) => {
  //   newWorkSheet.fillFormula(addressRange, formula, values);
  // });

  // Step 09. Image 삽입
  images.forEach(({ range, imageUrl }) => {
    if (imageUrl) {
      const extension = imageUrl.split(";")[0].split("/")[1];

      const imageId = workbook.addImage({
        base64: imageUrl,
        extension,
      });

      newWorkSheet.addImage(imageId, range);
    }
  });

  // Step 10. Sheet 암호 설정 (기본 "vendys123!")
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
  sheetLayout = {},
  sheetData = {} // Info: API를 통해 받아온 데이터 및 커스텀 options
) => {
  return new Promise((resolve, reject) => {
    const sheetLayoutKeys = Object.keys(sheetLayout).sort(); // Warning: 문자형으로 sorting하기 때문에 10개 이상의 sheet가 존재할 경우 비정상적으로 동작함;
    const sheetDataKeys = Object.keys(sheetData);

    try {
      sheetLayoutKeys.length > 0
        ? sheetLayoutKeys.forEach((sheetId) => {
            if (sheetId === "workbook") {
              setWorkbookProperties(workbook, sheetLayout[sheetId]);
            } else {
              generateSheet(
                workbook,
                sheetLayout[sheetId],
                sheetData[sheetId] || {}
              );
            }
          })
        : sheetDataKeys.forEach((sheetId) => {
            generateSheet(
              workbook,
              { workSheet: { name: sheetId } },
              sheetData[sheetId] || {}
            );
          });

      resolve(workbook);
    } catch (error) {
      reject(error);
    }
  });
};

const handleFileExport = async (sheetLayout, sheetData, fileName) => {
  const workbook = new ExcelJS.Workbook();
  const newWorkbook = await generateBook(workbook, sheetLayout, sheetData);

  (newWorkbook as any).xlsx
    .writeBuffer()
    .then((buffer) => {
      const excelData = new Blob([buffer], { type: DEFAULT_FILE_TYPE });
      // Dev
      // saveAs(excelData, fileName + DEFAULT_FILE_EXTENSION);
      // Prod
      FileSaver.saveAs(excelData, fileName + DEFAULT_FILE_EXTENSION);
    })
    .catch((error) => {
      console.error("Error saving file:", error);
    });
};

// Prod
export default handleFileExport;