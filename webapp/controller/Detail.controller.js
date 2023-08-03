sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/core/Fragment",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageBox",
	"sap/ui/core/ListItem",
	"../model/formatter",
	"sap/m/library"
], function(BaseController, JSONModel, Fragment, Filter, FilterOperator, MessageBox, ListItem, formatter, mobileLibrary) {
	"use strict";

	var that;

	// shortcut for sap.m.URLHelper
	var URLHelper = mobileLibrary.URLHelper;

	/*function _calculateOrderTotal (fPreviousTotal, oCurrentContext) {
		var fItemTotal = oCurrentContext.getObject().Quantity * oCurrentContext.getObject().UnitPrice;
		return fPreviousTotal + fItemTotal;
	}*/
	return BaseController.extend("poderosa.app.mantenimiento.controller.Detail", {

		formatter: formatter,

		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		onInit : function () {

			that = this;
			// Model used to manipulate control states. The chosen values make sure,
			// detail page is busy indication immediately so there is no break in
			// between the busy indication for loading the view's meta data
			this._aValidKeys = ["information", "order"];
			var oViewModel = new JSONModel({
				busy : false,
				delay : 0,
				lineItemListTitle : this.getResourceBundle().getText("detailLineItemTableHeading"),
				// the sum of all items of this order
				totalOrderAmount: 0,
				selectedTab: ""
			});

			this.getRouter().getRoute("object").attachPatternMatched(this._onObjectMatched, this);

			this.setModel(oViewModel, "detailView");

			this.getOwnerComponent().getModel().metadataLoaded().then(this._onMetadataLoaded.bind(this));
			//this.getOrderInfo();
		},

		/* =========================================================== */
		/* event handlers                                              */
		/* =========================================================== */

		/**
		 * Event handler when the share by E-Mail button has been clicked
		 * @public
		 */
		onSendEmailPress : function () {
			var oViewModel = this.getModel("detailView");

			URLHelper.triggerEmail(
				null,
				oViewModel.getProperty("/shareSendEmailSubject"),
				oViewModel.getProperty("/shareSendEmailMessage")
			);
		},


		/**
		 * Updates the item count within the line item table's header
		 * @param {object} oEvent an event containing the total number of items in the list
		 * @private
		 */
		onListUpdateFinished : function (oEvent) {
			var sTitle,
				fOrderTotal = 0,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("detailView"),
				oItemsBinding = oEvent.getSource().getBinding("items"),
				aItemsContext;

			// only update the counter if the length is final
			if (oItemsBinding.isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("detailLineItemTableHeadingCount", [iTotalItems]);
				} else {
					//Display 'Line Items' instead of 'Line items (0)'
					sTitle = this.getResourceBundle().getText("detailLineItemTableHeading");
				}
				oViewModel.setProperty("/lineItemListTitle", sTitle);

				aItemsContext = oItemsBinding.getContexts();
				//fOrderTotal = aItemsContext.reduce(_calculateOrderTotal, 0);
				//oViewModel.setProperty("/totalOrderAmount", fOrderTotal);
			}

		},

		/* =========================================================== */
		/* begin: internal methods                                     */
		/* =========================================================== */

		/**
		 * Binds the view to the object path and expands the aggregated line items.
		 * @function
		 * @param {sap.ui.base.Event} oEvent pattern match event in route 'object'
		 * @private
		 */
		_onObjectMatched : function (oEvent) {

			this._aviso = oEvent.getParameter("arguments").aviso || this._aviso || "0";
			this.getView().bindElement({
				path: "/" + this._aviso,
				model: "Aviso"
			});


			var oArguments = oEvent.getParameter("arguments");
			this._sObjectId = oArguments.aviso;
			// Don't show two columns when in full screen mode
			if (this.getModel("appView").getProperty("/layout") !== "MidColumnFullScreen") {
				this.getModel("appView").setProperty("/layout", "TwoColumnsMidExpanded");
			}
			/*
			this.getModel().metadataLoaded().then( function() {
				var sObjectPath = this.getModel().createKey("Aviso", {
					aviso :  this._sObjectId
				});
				this._bindView("/" + sObjectPath);
			}.bind(this));*/
			/*
			this.getView().bindElement({
				path: "/" + this._sObjectId,
				model: "Aviso"
			});*/

			var oQuery = oArguments["?query"];
			if (oQuery && this._aValidKeys.indexOf(oQuery.tab) >= 0){
				this.getView().getModel("detailView").setProperty("/selectedTab", oQuery.tab);
				this.getRouter().getTargets().display(oQuery.tab);
			} else {
				this.getRouter().navTo("object", {
					aviso: this._sObjectId,
					query: {
						tab: "information"
					}
				}, true);
			}
		},

		/**
		 * Binds the view to the object path. Makes sure that detail view displays
		 * a busy indicator while data for the corresponding element binding is loaded.
		 * @function
		 * @param {string} sObjectPath path to the object to be bound to the view.
		 * @private
		 */
		_bindView : function (sObjectPath) {
			// Set busy indicator during view binding
			var oViewModel = this.getModel("detailView");

			// If the view was not bound yet its not busy, only if the binding requests data it is set to busy again
			oViewModel.setProperty("/busy", false);

			this.getView().bindElement({
				path : sObjectPath,
				parameters: {
					expand: "Aviso"
				}
			});
		},

		_onBindingChange : function () {
			var oView = this.getView(),
				oElementBinding = oView.getElementBinding();

			// No data for the binding
			if (!oElementBinding.getBoundContext()) {
				this.getRouter().getTargets().display("detailObjectNotFound");
				// if object could not be found, the selection in the master list
				// does not make sense anymore.
				this.getOwnerComponent().oListSelector.clearMasterListSelection();
				return;
			}

			var sPath = oElementBinding.getPath(),
				oResourceBundle = this.getResourceBundle(),
				oObject = oView.getModel().getObject(sPath),
				sObjectId = oObject.aviso,
				sObjectName = oObject.aviso,
				oViewModel = this.getModel("detailView");

			this.getOwnerComponent().oListSelector.selectAListItem(sPath);

			oViewModel.setProperty("/shareSendEmailSubject",
				oResourceBundle.getText("shareSendEmailObjectSubject", [sObjectId]));
			oViewModel.setProperty("/shareSendEmailMessage",
				oResourceBundle.getText("shareSendEmailObjectMessage", [sObjectName, sObjectId, location.href, oObject.ShipName, oObject.EmployeeID, oObject.CustomerID]));
		},

		_onMetadataLoaded : function () {
			// Store original busy indicator delay for the detail view
			var iOriginalViewBusyDelay = this.getView().getBusyIndicatorDelay(),
				oViewModel = this.getModel("detailView"),
				oLineItemTable = this.byId("lineItemsList");
				//iOriginalLineItemTableBusyDelay = oLineItemTable.getBusyIndicatorDelay();

			// Make sure busy indicator is displayed immediately when
			// detail view is displayed for the first time
			oViewModel.setProperty("/delay", 0);
			oViewModel.setProperty("/lineItemTableDelay", 0);

			/*oLineItemTable.attachEventOnce("updateFinished", function() {
				// Restore original busy indicator delay for line item table
				oViewModel.setProperty("/lineItemTableDelay", iOriginalLineItemTableBusyDelay);
			});*/

			// Binding the view will set it to not busy - so the view is always busy if it is not bound
			oViewModel.setProperty("/busy", false);
			// Restore original busy indicator delay for the detail view
			oViewModel.setProperty("/delay", iOriginalViewBusyDelay);
		},
		onTabSelect : function(oEvent){
			var sSelectedTab = oEvent.getParameter("selectedKey");
			this.getRouter().navTo("object", {
				aviso: this._sObjectId,
				query: {
					tab: sSelectedTab
				}
			}, true);// true without history

		},

		_onHandleTelephonePress : function (oEvent){
			var sNumber = oEvent.getSource().getText();
			URLHelper.triggerTel(sNumber);
		},

		/**
		 * Set the full screen mode to false and navigate to master page
		 */
		onCloseDetailPress: function () {
			this.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", false);
			// No item should be selected on master after detail page is closed
			this.getOwnerComponent().oListSelector.clearMasterListSelection();
			this.getRouter().navTo("master");
		},

		/**
		 * Toggle between full and non full screen mode.
		 */
		toggleFullScreen: function () {
			var bFullScreen = this.getModel("appView").getProperty("/actionButtonsInfo/midColumn/fullScreen");
			this.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", !bFullScreen);
			if (!bFullScreen) {
				// store current layout and go full screen
				this.getModel("appView").setProperty("/previousLayout", this.getModel("appView").getProperty("/layout"));
				this.getModel("appView").setProperty("/layout", "MidColumnFullScreen");
			} else {
				// reset to previous layout
				this.getModel("appView").setProperty("/layout",  this.getModel("appView").getProperty("/previousLayout"));
			}

		},
		
		onLoadDataOrder: function(oInfo,option){
			if ( this.getView().getModel("Aviso").oData[this._aviso] !== undefined ) {
				var info = this.getView().getModel("Aviso").oData[this._aviso];

				if ( info !== undefined ){
					var equipo = this.getView().getModel("Aviso").oData[this._aviso].equnr;
					this.getView().byId("fc_filterEquipo").setSelectedKey(equipo);
					this.getView().byId("fc_filterEquipo").setValue(equipo);					
					var puestoT = this.getView().getModel("Aviso").oData[this._aviso].tplnr;
					this.getView().byId("fc_filterUbicacionT").setSelectedKey(puestoT);
					this.getView().byId("fc_filterUbicacionT").setValue(puestoT);					
				}
			}
		},

		onOpenNewOrder : function (oEvent) {
			// Llamar Form Creación Orden
			if (!this._pViewSettingsDialog) {
				this._pViewSettingsDialog = Fragment.load({
					id: this.getView().getId(),
					name: "poderosa.app.mantenimiento.view.NewOrder",
					controller: this
				}).then(function(oDialog){
					// connect dialog to the root view of this component (models, lifecycle)
					this.getView().addDependent(oDialog);
					oDialog.addStyleClass(this.getOwnerComponent().getContentDensityClass());
					return oDialog;
				}.bind(this));
			}
			this._pViewSettingsDialog.then(function(oDialog) {
				oDialog.open();
				that.onLoadDataOrder();
			});
		},

		onClearData: function(){
			//Limpiar fields al cerrar Dialog// 
			this.getView().byId("fc_cboTipoOrden").setValue("");
			this.getView().byId("fc_filterpuestoT").setValue("");
			this.getView().byId("fc_filterEquipo").setValue("");
			this.getView().byId("fc_filterUbicacionT").setValue("");
			this.getView().byId("fc_cboPrioridad").setValue("");
		},

		onEndOrder: function () {
			//Cerrar Dialog//
			this.onClearData();
			this.byId("IdCreateOrder").close();
		},

		onValidateOrder: function(){

			var ok = true;
			
			if (this.getView().byId("fc_cboTipoOrden").getValue() === ""){
				ok = false;
				MessageBox.error("Debe Indicar el Tipo de Orden");
			}else if (this.getView().byId("fc_filterpuestoT").getValue() === ""){
				ok = false;
				MessageBox.error("Debe Ingresar Puesto de Trabajo");
			}else if (this.getView().byId("fc_filterEquipo").getValue() === ""){
				ok = false;
				MessageBox.error("Debe Ingresar Equipo");
			}else if (this.getView().byId("fc_filterUbicacionT").getValue() === ""){
				ok = false;
				MessageBox.error("Debe Ingresar Ubicación Técnica");
			}else if (this.getView().byId("fc_cboPrioridad").getValue() === ""){
				ok = false;
				MessageBox.error("Debe Indicar la Prioridad");
			}
			
			return ok;

		},

		onCreateOrder: function () {
			//Creación de Orden//
			var oModel = new sap.ui.model.odata.v2.ODataModel("/sap/opu/odata/sap/ZGW_APP_MANTEN_ISP_SRV/");
			var ofilters = [];
			var ordenRow = {};
			var oData = {};
			
			//Verificar antes de enviar
			if (this.onValidateOrder()){
				
				ordenRow.aufart = this.getView().byId("fc_cboTipoOrden").getSelectedKey();
				ordenRow.qmart = this.getView().getModel("Aviso").oData[this._aviso].qmart;
				ordenRow.arbpl = this.getView().byId("fc_filterpuestoT").getSelectedKey();
				ordenRow.equnr = this.getView().byId("fc_filterEquipo").getSelectedKey();
				ordenRow.btpln = this.getView().byId("fc_filterUbicacionT").getSelectedKey();
				ordenRow.priok = this.getView().byId("fc_cboPrioridad").getSelectedKey();
				ordenRow.qmnum = this.getView().getModel("Aviso").oData[this._aviso].qmnum;
				
				oData.is_orden_c = JSON.stringify(ordenRow);
				
				sap.ui.core.BusyIndicator.show();
				
				oModel.create("/ordenSet", oData , {
					filters: ofilters,
					success: function (result) {
						sap.ui.core.BusyIndicator.hide();
						if (result.e_operacion === '001') {
							MessageBox.success(result.e_msg);	
							that.onEndOrder();
						}else{
							MessageBox.error(result.e_msg);
							that.onEndOrder();
						}
					},
					error: function (err) {
						sap.ui.core.BusyIndicator.hide();
						MessageBox.error(JSON.parse(err.responseText).error.message.value);
					}
				});
			}
		},

		onBusquedaSensitiva: function (valor, filter1, filter2, objeto, input2) {
			//Filtros de Búsqueda Sensitiva//

			var oModel = new sap.ui.model.odata.v2.ODataModel("/sap/opu/odata/sap/ZGW_APP_MANTEN_ISP_SRV/");

			var ofilters = [];
			var filter = new Filter({
				path: "i_value",
				operator: FilterOperator.EQ,
				value1: valor
			});
			ofilters.push(filter);

			if (filter1 !== "") {
				var filter = new Filter({
					path: "i_filter",
					operator: FilterOperator.EQ,
					value1: filter1
				});
				ofilters.push(filter);
			}

			if (filter2 !== "") {
				var filter = new Filter({
					path: "i_filter_2",
					operator: FilterOperator.EQ,
					value1: filter2
				});
				ofilters.push(filter);
			}

			var filter = new Filter({
				path: "i_object",
				operator: FilterOperator.EQ,
				value1: objeto
			});
			ofilters.push(filter);
			
			sap.input2 = input2;

			sap.ui.core.BusyIndicator.show();
			oModel.read("/filtrosSet", {
				filters: ofilters,
				success: function (result) {
					sap.input2.destroySuggestionItems();
					if ( result.results[0].et_data.length > 0 ) {
						for (var j = 0; j < JSON.parse(result.results[0].et_data).length; j++) {
							sap.input2.addSuggestionItem(new ListItem({
								key: JSON.parse(result.results[0].et_data)[j].VALUE,
								text: JSON.parse(result.results[0].et_data)[j].TEXTO,
								additionalText: JSON.parse(result.results[0].et_data)[j].VALUE
							}));
						}	
					}
					
					sap.ui.core.BusyIndicator.hide();
				},
				error: function (err) {
					sap.ui.core.BusyIndicator.hide();
				}
			});

		},

		onValidateFields: function (){
		//Validación de campos
			/*
			var ubicacionT = sap.ui.getCore().byId("fc_filterUbicacionT");
			var grupoP	   = sap.ui.getCore().byId("fc_filterGrupoP");
			
			if (ubicacionT.getValue() !== ""){
				grupoP.setEditable(false);
				grupoP.setValue("");
			}else{
				grupoP.setEditable(true);
				//grupoP.setValue("");
			}
			
			if (grupoP.getValue() !== ""){
				ubicacionT.setEditable(false);
				ubicacionT.setValue("");
			}else{
				ubicacionT.setEditable(true);
				//ubicacionT.setValue("");
			}*/
		},

		onLiveChange: function (oEvent) {
			//Consulta en Tiempo Real
			var campo = oEvent.getSource().data("campo");
			var valor = oEvent.getSource().getValue();
			var input2 = oEvent.getSource();

			switch (campo) {
			case "EQUNR":
				that.onBusquedaSensitiva(valor, "", "", campo, input2);
				break;
			case "BTPLN":
				that.onBusquedaSensitiva(valor, "", "", campo, input2);
				that.onValidateFields();
				break;
			case "INGRP":
				that.onBusquedaSensitiva(valor, "", "", campo, input2);
				that.onValidateFields();
				break;
			case 'ARBPL':
				that.onBusquedaSensitiva(valor, "", "", campo, input2);
				break;
			}
		},
		
		onOpenNewNotification : function (oEvent) {
			// Llamar Form Creación Notificacion
			that = this;
			if (!this._pViewSettingsDialog2) {
				this._pViewSettingsDialog2 = Fragment.load({
					id: this.getView().getId(),
					name: "poderosa.app.mantenimiento.view.NewNotification",
					controller: this
				}).then(function(oDialog2){
					// connect dialog to the root view of this component (models, lifecycle)
					this.getView().addDependent(oDialog2);
					oDialog2.addStyleClass(this.getOwnerComponent().getContentDensityClass());
					return oDialog2;
				}.bind(this));
			}
			this._pViewSettingsDialog2.then(function(oDialog2) {
				oDialog2.open();
				that.onLoadData(that.getView().byId("fc_IOrden"));				
			});
		},

		onLoadData: function(oInfo) {		
			if ( this.getView().getModel("Aviso").oData[this._aviso] !== undefined ) {
				var info = this.getView().getModel("Aviso").oData[this._aviso].order_info;

				if ( info !== undefined && this.getView().getModel("Aviso").oData[this._aviso].order_info.length > 0 ){
					var orden = this.getView().getModel("Aviso").oData[this._aviso].order_info[0].aufnr;
					oInfo.setSelectedKey(orden);
					oInfo.setSelectedKey().setValue(orden);
				}
			}
							
		},

		onEndNotification: function () {
			//Cerrar Dialog//
			this.byId("IdCreateNotification").close();			
			this.onClearDataNotif();
		},

		onClearDataNotif: function(){
			//Limpiar fields al cerrar Dialog// 
			this.getView().byId("fc_IOrden").setValue("");
			this.getView().byId("fc_IOperacion").setValue("");
			this.getView().byId("fc_IHorasN").setValue("");
			this.getView().byId("fc_ICentro").setValue("");
			this.getView().byId("fc_IpuestoT").setValue("");
			this.getView().byId("fc_INumPersonal").setValue("");
		},

		onValidateNotif: function(){

			var ok = true;
			
			if (this.getView().byId("fc_IOrden").getValue() === ""){
				ok = false;
				MessageBox.error("Debe Indicar Orden");
			}else if (this.getView().byId("fc_IOperacion").getValue() === ""){
				ok = false;
				MessageBox.error("Debe Ingresar Operación");
			}else if (this.getView().byId("fc_IHorasN").getValue() === ""){
				ok = false;
				MessageBox.error("Debe Num. Horas");
			}else if (this.getView().byId("fc_ICentro").getValue() === ""){
				ok = false;
				MessageBox.error("Debe Ingresar Centro");
			}else if (this.getView().byId("fc_IpuestoT").getValue() === ""){
				ok = false;
				MessageBox.error("Debe Ingresar Puesto de Trabajo");
			}
			
			return ok;
		},

		onCreateNotification: function () {
			//Creación de Orden//
			var oModel = new sap.ui.model.odata.v2.ODataModel("/sap/opu/odata/sap/ZGW_APP_MANTEN_ISP_SRV/");
			var ofilters = [];
			var notifRow = {};
			var oData = {};
			
			//Verificar antes de enviar
			if (this.onValidateNotif()){
				
			if ( this.getView().getModel("Aviso").oData[this._aviso].order_info[0] !== undefined ){
				notifRow.aufnr = this.getView().getModel("Aviso").oData[this._aviso].order_info[0].aufnr;
			}			
			notifRow.vornr = this.getView().byId("fc_IOperacion").getValue();
			notifRow.ismnw = this.getView().byId("fc_IHorasN").getValue();
			notifRow.werks = this.getView().byId("fc_ICentro").getValue();//1710
			notifRow.arbpl = this.getView().byId("fc_IpuestoT").setValue("").getSelectedKey();
			notifRow.arbeite = "H";
			notifRow.aueru = "X";
				
			oData.is_notification_c = JSON.stringify(notifRow);
				
			sap.ui.core.BusyIndicator.show();
				
				oModel.create("/notificacionSet", oData , {
					filters: ofilters,
					success: function (result) {
						sap.ui.core.BusyIndicator.hide();
						if (result.e_operacion === '001') {
							MessageBox.success(result.e_msg);	
							that.onEndNotification();
						}else{
							MessageBox.error(result.e_msg);
							that.onEndNotification();
						}
					},
					error: function (err) {
						sap.ui.core.BusyIndicator.hide();
						MessageBox.error(JSON.parse(err.responseText).error.message.value);
					}
				});
			}
		},
		/*
		onOpenNewRegistration : function (oEvent) {
			// Llamar Form Creación Registro Horas
			if (!this._pViewSettingsDialog3) {
				this._pViewSettingsDialog3 = Fragment.load({
					id: this.getView().getId(),
					name: "poderosa.app.mantenimiento.view.NewRegistration",
					controller: this
				}).then(function(oDialog3){
					// connect dialog to the root view of this component (models, lifecycle)
					this.getView().addDependent(oDialog3);
					oDialog3.addStyleClass(this.getOwnerComponent().getContentDensityClass());
					return oDialog3;
				}.bind(this));
			}
			this._pViewSettingsDialog3.then(function(oDialog3) {
				oDialog3.open();
			});
		},

		onEndRegistration: function () {
			//Cerrar Dialog//
			//this.onClearData();
			this.byId("IdCreateRegistration").close();
		},

		onCreateRegistration: function () {
			//Creación de Orden//
			var oModel = new sap.ui.model.odata.v2.ODataModel("/sap/opu/odata/sap/ZGW_APP_MANTEN_ISP_SRV/");
			var ofilters = [];
			var registRow = {};
			var oData = {};
			
			//Verificar antes de enviar
			//if (this.onValidate()){
			
			registRow.POINT = "12";
			registRow.IDATE = "20.03.2023";
			registRow.ITIME = "22:04:03";
			//registRow.READR = ;
			registRow.GENER = "A";
			registRow.RECDC = "125";
			registRow.PREPA_U = "X";
			registRow.WAIT_C = "X";
			registRow.QMART = "M2";
				
			oData.is_registro_c = JSON.stringify(registRow);
				
			sap.ui.core.BusyIndicator.show();
				
				oModel.create("/registroSet", oData , {
					filters: ofilters,
					success: function (result) {
						sap.ui.core.BusyIndicator.hide();
						if (result.e_operacion === '001') {
							MessageBox.success(result.e_msg);	
							that.onEndRegistration();
						}else{
							MessageBox.error(result.e_msg);
							that.onEndRegistration();
						}
					},
					error: function (err) {
						sap.ui.core.BusyIndicator.hide();
						MessageBox.error(JSON.parse(err.responseText).error.message.value);
					}
				});
			//}
		},*/
	});
});